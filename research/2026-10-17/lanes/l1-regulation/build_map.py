#!/usr/bin/env python3
"""Builds the H1 regulatory use-case map and its companion tables.

Lane l1-regulation, 2026-10-17. Every cell starts with a status token:
  LAWFUL | LWC (lawful-with-conditions, conditions named) | NOT-VIABLE | N/A | UNCLEAR
followed by the conditions and the source ids in [brackets]. Source ids resolve in sources.csv.
Dates are effective dates as computed from the instrument's own commencement clause
(publication date + N days) unless stated otherwise.

Run: python3 -I build_map.py   (writes CSVs next to this file)
"""
import csv, os

HERE = os.path.dirname(os.path.abspath(__file__))

SOURCES = [
 # id, title, url, pub_date, accessed, method, confidence, note
 ("S01","TRAI TCCCPR 2018 (principal regulations, 6 of 2018)","https://www.trai.gov.in/sites/default/files/2024-09/RegulationUcc19072018.pdf","2018-07-19","2026-10-17","read-primary","high","Schedule-II item 3: promotional time bands; Schedule-I item 2: CLI headers for voice"),
 ("S02","TRAI TCCCPR (Second Amendment) Regulations 2025 (1 of 2025)","https://www.trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf","2025-02-12","2026-10-17","read-primary","high","Definitions of promotional/service/transactional calls; reg 3 (registered headers or special series only); reg 4 autodialer/robocall intimation; reg 25 sender penalties; reg 27/28/28A financial disincentives on telcos; Sch-IV UCC_Detect signals"),
 ("S03","TRAI TCCCPR (Third Amendment) Regulations 2026 (05 of 2026) incl. Explanatory Memorandum","https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf","2026-09-18","2026-10-17","read-primary","high","A2P call definition incl. artificial voice; A2P pre-declaration (reg 4); 7-day inquiry relationship; legacy consents; reg 21A AI flagging; reg 35A A2P termination charge Rs 0.05/min; 140/1600/1601 exempt; CPaaS treated as Sender/aggregator (memo para 26)"),
 ("S04","PIB: TRAI strengthens framework for curbing UCC (Third Amendment)","https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2311989&lang=1&reg=3","2026-09-18","2026-10-17","read-primary","high","Government summary of Third Amendment"),
 ("S05","TRAI Direction: disconnection of all telecom resources and blacklisting (UTM SIP/PRI)","https://www.trai.gov.in/sites/default/files/2024-09/Direction_13082024.pdf","2024-08-13","2026-10-17","read-primary","high","12 lakh complaints vs UTMs in 2023; promotional calls from unregistered SIP/PRI to stop"),
 ("S06","TRAI Direction: phase-wise mandatory 1600-series for RBI, SEBI, PFRDA entities","https://www.trai.gov.in/sites/default/files/2025-11/Direction_19112025.pdf","2025-11-19","2026-10-17","read-primary","high","Deadlines 2026-01-01 / 02-01 / 03-01 (RBI), 02-15 / 03-15 (SEBI), 02-15 (PFRDA); no service calls from other numbers even with consent"),
 ("S07","TRAI Direction: mandatory 1600-series for IRDAI entities","https://www.trai.gov.in/sites/default/files/2025-12/Direction_16122025.pdf","2025-12-16","2026-10-17","read-primary","high","Deadline 2026-02-15"),
 ("S08","TRAI Direction: allocation and operationalisation of 1601 series (non-BFSI service/transactional calls), Phase-I","https://www.trai.gov.in/sites/default/files/2026-08/Direction_10082026.pdf","2026-08-10","2026-10-17","read-primary","high","Phase-I: utilities; logistics and courier. Migration within 90 days. Never for promotional calls"),
 ("S09","TRAI Direction: pilot for digital consent acquisition via Consent Registration Function (CRF) with RBI-regulated banks","https://www.trai.gov.in/sites/default/files/2025-06/Direction_13062025.pdf","2025-06-13","2026-10-17","read-primary","high","CRF under-used by senders; 3-month bank pilot; sector-wise roll-out to follow"),
 ("S10","TRAI Direction: AI/ML-based UCC_Detect intelligence sharing and action against UCC senders","https://www.trai.gov.in/sites/default/files/2026-02/Direction_27022026.pdf","2026-02-27","2026-10-17","read-primary","high","~85% of UCC complaints are against UTMs; 5 flagged CLIs in 10 days triggers KYC re-verification then barring"),
 ("S11","TRAI PR 111/2026: Quarterly highlights of action against UCC, Q1 FY2026-27","https://www.trai.gov.in/sites/default/files/2026-08/PR_No111of2026.pdf","2026-08-04","2026-10-17","read-primary","high","Enforcement and DND statistics Apr-Jun 2026"),
 ("S12","TRAI PR 20/2026: Action taken on spam in 2025","https://www.trai.gov.in/sites/default/files/2026-02/PR_No.20of2026.pdf","2026-02-13","2026-10-17","read-primary","high","2025 enforcement statistics; 21.05 lakh resources disconnected since Aug 2024"),
 ("S13","TRAI PR 91/2026: clarification on 1600 and 140 series","https://trai.gov.in/sites/default/files/2026-07/PR_No91of2026.pdf","2026-07-10","2026-10-17","read-primary","high","140 mandatory for promotional calls by any sector; 1600 for BFSI service calls to existing customers"),
 ("S14","TRAI consultation listing (no consultation on AI/synthetic-voice call disclosure found)","https://www.trai.gov.in/release-publication/consultation","2026-10-09","2026-10-17","read-primary","medium","Absence finding: listing read 2026-10-17, latest item 2026-10-09"),
 ("S15","TRAI directions listing (no instrument dated 2026-03-10)","https://www.trai.gov.in/release-publication/directions","2026-10-01","2026-10-17","read-primary","medium","Absence finding for the harvest's 2026-03-10 claim"),
 ("S16","Digital Personal Data Protection Act 2023 (Gazette copy hosted by TRAI)","https://www.trai.gov.in/sites/default/files/2024-09/DPDT_11082024.pdf","2023-08-11","2026-10-17","read-primary","high","s.3(c)(ii) public data exclusion; s.4 grounds; s.5 notice; s.7(a) voluntarily-provided legitimate use (illustration: real-estate broker); s.8(2) processors; s.9 children"),
 ("S17","PIB explainer: DPDP Rules 2025 notified","https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf","2025-11-17","2026-10-17","read-primary","high","Notified 14 Nov 2025; 18-month phased compliance; penalties up to Rs 250 cr / 200 cr / 50 cr"),
 ("S18","DPDP Rules 2025 phase-in dates (secondary: Bar & Bench; dcomply rule table, verified 2026-09-08)","https://www.barandbench.com/view-point/meity-notifies-final-digital-personal-data-protection-rules-2025 ; https://dpdpa.dcomply.in/rules/","2025-11-14","2026-10-17","read-secondary","medium-high","Rule 4 (consent managers) +12 months; Rules 3, 5-16, 22, 23 +18 months; Gazette (egazette.gov.in) blocked; sources split 13 vs 14 day-of-month"),
 ("S19","DPDP (Removal of Difficulties) Order 2026, S.O. 5458(E) (secondary: SCC Online)","https://www.scconline.com/blog/post/2026/10/15/dpdp-removal-of-difficulties-order-2026/","2026-10-05","2026-10-17","read-secondary","medium","Textual fixes to s.9(1) and s.10(2)(c)(ii); no timeline change; 12-month compression proposal not notified"),
 ("S20","IT (Intermediary Guidelines) Amendment Rules 2026 on synthetically generated information (secondary: AMS Shardul update; Hogan Lovells)","https://www.amsshardul.com/wp-content/uploads/2026/02/Legislative-Update-IT-Rules-Amendment.pdf","2026-02-10","2026-10-17","read-secondary","medium-high","In force 2026-02-20; SGI includes audio; intermediaries offering SGI tools must ensure a prominently prefixed audio disclosure and embedded provenance metadata; meity.gov.in blocked"),
 ("S21","CCPA Guidelines for Prevention and Regulation of Dark Patterns 2023 + enforcement (secondary: Mondaq; Policy Edge; Storyboard18)","https://www.mondaq.com/ccpas-guidelines-on-dark-patterns-an-overview/1844140","2023-11-30","2026-10-17","read-secondary","medium","13 specified patterns incl. false urgency, nagging, disguised advertisement; June 2025 self-audit advisory; Rs 20 lakh penalties in 7 cases"),
 ("S22","RBI (NBFC - Responsible Business Conduct) Third Amendment Directions 2026 and 8 sibling directions, RBI/2026-27/223-231 (secondary: corplawupdates summary)","https://www.corplawupdates.in/updates/rbi-amendment-directions-recovery-agents-loan-dues-2026 ; primary https://rbidocs.rbi.org.in/rdocs/notification/PDFs/NT230A919C5A725694DD78C1C3640B455C4E9.PDF (CAPTCHA-blocked)","2026-08-06","2026-10-17","read-secondary","medium","Effective 2027-01-01; contact only 08:00-19:00; bi-directional call recording with 6-month retention; recovery agency definition; IIBF certification"),
 ("S23","RBI recovery agents: no calls before 08:00 or after 19:00 (existing rule, 2022 circular carried into RBC Directions 2025; secondary)","https://www.outlookbusiness.com/news/rbi-proposes-to-bar-recovery-agents-from-calling-borrowers-before-8-am-after-7-pm","2025-11-28","2026-10-17","read-secondary","medium","rbi.org.in blocked by CAPTCHA"),
 ("S24","IRDAI Guidelines on Distance Marketing of Insurance Products (2011)","https://irdai.gov.in/web/guest/document-detail?documentId=366441","2011-04-05","2026-10-17","read-primary","medium","9.3(ii) hours per TRAI/DoT; 9.3(iv) inform call is recorded, voice copy; s.12 records. Current applicability after IRDAI's 2024 consolidation not verified"),
 ("S25","Telecommunications Bill 2023 as introduced (PRS copy) - Third Schedule civil penalties","https://prsindia.org/files/bills_acts/bills_parliament/2023/The%20Telecommunications%20Bill,%202023.pdf","2023-12-18","2026-10-17","read-primary","medium","s.28 specified messages; Third Schedule item 3: up to Rs 50,000 first, up to Rs 2 lakh each subsequent or suspension; item 2: up to Rs 10 lakh for using unauthorised telecom service. Enacted Act text (India Code/eGazette) blocked; enacted numbers reported identical by secondary sources"),
 ("S26","Telecommunications (Authorisation for Provision of Principal Telecommunication Services) Rules 2026, G.S.R. 513(E) (secondary: Whitewater; also cited in S03 memo)","https://www.whitewater.co.in/post/from-ul-vno-license-to-principal-telecom-services-authorisation","2026-06-23","2026-10-17","read-secondary","medium","5 VNO authorisation types; Access Service entry fee Rs 12.5 lakh per service area; 8% AGR; eservices.dot.gov.in blocked (403)"),
 ("S27","Exotel press release: UL-VNO Access Service licence (vendor claim)","https://exotel.com/glossary/dot-license/","2022-11-10","2026-10-17","vendor-claim","medium","Pan-India UL-VNO; relies on partner networks"),
 ("S28","Exotel developer FAQ: calling hours (vendor)","https://developer.exotel.com/docs/faqs/calling-hours","2026","2026-10-17","vendor-claim","low","States 09:00-21:00 for promotional; contradicts S01 default bands; does not enforce at API level"),
 ("S29","WhatsApp Business Messaging Policy (last updated 2026-09-23)","https://business.whatsapp.com/policy","2026-09-23","2026-10-17","read-primary","high","Opt-in required; automation allowed with human escalation paths; separate opt-in for calls as best practice"),
 ("S30","Meta Terms for WhatsApp Business Platform s.4.7 AI Providers (last modified 2026-09-23)","https://www.whatsapp.com/legal/business-solution-terms","2026-09-23","2026-10-17","read-primary","high","General-purpose AI as primary functionality prohibited; Platform Data may not train/improve AI models except a model for the business's exclusive use"),
 ("S31","WhatsApp Business Platform pricing + INR rate card effective 2026-10-01","https://developers.facebook.com/docs/whatsapp/pricing/","2026-10-01","2026-10-17","measured","high","Parsed rate card xlsx: India marketing Rs 0.8631, utility Rs 0.115, authentication Rs 0.115, auth-international Rs 2.4971 per message"),
 ("S32","WhatsApp per-user marketing template message limits (error 131049)","https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits.md","2026","2026-10-17","read-primary","high","Dynamic per-user cap across all businesses; not active in EEA/UK/JP/KR; India is subject to it"),
 ("S33","WhatsApp Business Calling API docs (business-initiated calls, user call permissions)","https://developers.facebook.com/documentation/business-messaging/whatsapp/calling.md","2026","2026-10-17","read-primary","high","Business-initiated calling available except US, Canada, Egypt, Vietnam, Nigeria; needs user call permission (permanent permission since 2025-11-03); 10,000 call initiations/24h/number"),
 ("S34","Google Workspace: Email sender guidelines (bulk senders)","https://support.google.com/a/answer/81126","2024-02-01","2026-10-17","read-primary","high","SPF+DKIM+DMARC, one-click unsubscribe, spam rate below 0.30%"),
 ("S35","CNAP (caller name display) rollout from 2026-11-01 (news: Inc42 / Telangana Today, Oct 2026)","https://inc42.com/buzz/centre-directs-telcos-to-display-caller-names-from-november-1/","2026-10-15","2026-10-17","read-secondary","medium","KYC name shown by default on 4G+; enterprise names must be registered trademark or GST trade name"),
 ("S36","Harvest claim origin: html-portfolio commit 0657e21b docs/research/market-sweep-2026-08-25.md (cites qcall.ai vendor page) and docs/harvest/hp-maya-latest.md","https://qcall.ai/trai-updates-for-ai-calling","2026-08-25","2026-10-17","read-secondary","low","Claim 'TRAI TCCCPR 2026: mandatory AI disclosure ... full effect 2026-03-10'; vendor page cites no TRAI document"),
 ("S37","Harvest: CommandCentre measured Meta error 131049 dropping cold marketing templates","/home/user/sales-enabler/docs/harvest/cc-branches.md","2026-10-15","2026-10-17","measured","medium","Owner's own product, n not stated in harvest"),
 ("S38","SEBI directs regulated entities to use 1600 series for service/transactional calls (secondary: Business Standard)","https://www.business-standard.com/markets/news/sebi-directs-entities-to-use-1600-phone-number-series-for-service-calls-125040801058_1.html","2025-04-08","2026-10-17","read-secondary","medium","Primary sebi.gov.in not fetched"),
 ("S39","RBI FREE-AI framework (Aug 2025) - recommendations incl. AI disclosures in board policy (secondary: Bar & Bench)","https://www.barandbench.com/view-point/rbis-free-ai-framework-navigating-the-legal-and-regulatory-landscape","2025-08-13","2026-10-17","read-secondary","medium","Not binding as of sources read"),
]

BLOCKED = [
 ("egazette.gov.in","TLS chain verification failure via proxy (curl 60 / Playwright: 'unable to verify the first certificate'; browser nav 502)","DPDP Rules G.S.R. 846(E); Telecom Act 2023 gazette"),
 ("meity.gov.in","Akamai 'Access Denied' to headless browser; static HTML is a JS shell","DPDP Rules, IT Rules 2026 text"),
 ("rbi.org.in / rbidocs.rbi.org.in","CAPTCHA ('What code is in the image?') - not attempted to bypass","RBI/2026-27/223-231 recovery directions; RBC Directions 2025"),
 ("eservices.dot.gov.in","HTTP 403","VNO authorisation fee schedule"),
 ("indiacode.nic.in","HTTP 504","Telecommunications Act 2023 as enacted"),
 ("dot.gov.in","404 on guessed path; no document found","Telecom Act / OSP guidelines"),
]

# Use-case map. Columns in order.
COLS = ["use_case_id","use_case","phase","direction_consent_class",
        "number_series","dlt_header_template_registration","dnd_ncpr_scrubbing","digital_consent_acquisition",
        "calling_hours","ai_disclosure_synthetic_voice","call_recording","dpdp_act_rules","sector_rules",
        "platform_policy","penalties_enforcement","status_today_2026_10_17","status_12m_to_2027_10",
        "verdict_pre_sales","verdict_post_sales","kill_criterion_check","key_sources","confidence"]

AI_DISCLOSE = ("LWC: no TRAI rule requires telling the callee the voice is AI (Third Amendment read in full; no TRAI consultation on it) [S03 2026-09-18; S14]. "
               "From 2026-11-17 the Sender must pre-declare A2P use (defined to include artificial voice) and CLI ranges to its telco, recorded on DLT; undeclared A2P calls are UCC [S03 reg 4]. "
               "IT Rules 2026: an intermediary offering tools that create synthetic audio must ensure a 'prominently prefixed audio disclosure' plus provenance metadata (in force 2026-02-20; whether a B2B voice-agent SaaS is such an intermediary is UNCLEAR) [S20]. "
               "A call made 'to deceive or attempt to deceive' is UCC [S02 def (bw) proviso 2] -> never deny being AI. Policy: disclose at call start.")
REC = ("LWC: no Indian statute found requiring all-party consent for a participant to record (gap; lawyer to confirm). Announce recording at start; "
       "from ~2027-05-13 a voice recording is personal data needing DPDP notice and a purpose [S16 s.5; S18]. Sector overlays: IRDAI tele-calls must say the call is recorded [S24]; RBI recovery calls recorded and retained 6 months from 2027-01-01 [S22].")

ROWS = [
 dict(use_case_id="U1",use_case="Cold promotional outbound voice to numbers that never opted in (B2C; purchased or scraped lists)",phase="pre-sales",direction_consent_class="outbound / cold",
  number_series="LWC: promotional calls only from a 140xx number held by a registered Sender/Telemarketer; 10-digit, 1600 and 1601 numbers may not carry promotion [S02 reg 3; S13 2026-07-10; S08 para 7].",
  dlt_header_template_registration="LWC: Sender (Principal Entity) registration on DLT with physical verification, biometric of authorised person and a linked mobile [S02 Sch-I 1(4), in force ~2025-04-13]; CLI is the voice header [S01 Sch-I item 2]; A2P declaration from 2026-11-17 [S03 reg 4]. 140 is exempt from the Rs 0.05/min A2P termination charge [S03 reg 35A].",
  dnd_ncpr_scrubbing="LWC: telco pre-scrubs every 140 call against the preference register. 224M of 1.348B subscribers (16%) have a preference; 1.48B of 13.16B 140-calls (11.2%) were blocked in Q1 FY27 [S11]. For subscribers with no preference TRAI treats consent as deemed (opt-out regime) [S03 memo; S13].",
  digital_consent_acquisition="NOT-VIABLE for DND-registered numbers: delivery to a blocked category needs Explicit Consent in the Consent Register [S02 def (av)]; a cold list has none.",
  calling_hours="LWC: time bands 00-06, 06-08, 08-10 and 21-24 are default OFF for promotional traffic, so effective window 10:00-21:00 unless the recipient opts in [S01 Sch-II item 3 Note-1]. (Exotel FAQ says 09:00-21:00 [S28] - contradiction, primary wins.)",
  ai_disclosure_synthetic_voice=AI_DISCLOSE, call_recording=REC,
  dpdp_act_rules="LAWFUL today (core obligations not in force). From ~2027-05-13 NOT-VIABLE for purchased/scraped lists of individuals: processing needs consent (s.4, s.6) or a s.7 legitimate use, and DPDP has no legitimate-interest ground [S16; S17; S18]. Exception: numbers the person published themselves are outside the Act (s.3(c)(ii)) - see U1b.",
  sector_rules="LWC: BFSI promotion only via 140 [S13]; insurance tele-sales need interest confirmation, standard scripts, recording notice [S24].",
  platform_policy="N/A",
  penalties_enforcement="INFO: Registered senders: complaint (within 7 days) -> telco checks scrubbing/pre-checks; violators actioned [S02 reg 25(4)]. Unregistered: 3 complaints + AI flag, or 5 complaints in 10 days -> suspension; first proven violation = 15-day bar of ALL resources at ALL telcos; repeat = 1-year disconnection + blacklist + device block [S03 reg 25(5)-(6)]. Q1 FY27: 137,053 resources barred, 46,786 disconnected, 263 senders blacklisted [S11]. Telecom Act s.28: up to Rs 50k, then Rs 2 lakh per instance or suspension [S25].",
  status_today_2026_10_17="LWC (registered sender, 140 number, non-DND recipients only, 10:00-21:00, A2P declared)",
  status_12m_to_2027_10="NOT-VIABLE for B2C purchased/scraped lists after ~2027-05-13 (DPDP consent); LWC only for self-published numbers",
  verdict_pre_sales="Do not build the wedge on it. Lawful today only through 140 numbers to the 84% of subscribers with no DND preference, and loses its legal basis for bought lists in May 2027.",
  verdict_post_sales="N/A",
  kill_criterion_check="TRIGGERED: needs consent the buyer cannot produce (explicit CRF consent for DND numbers today; DPDP consent for bought lists from 2027-05).",
  key_sources="S01;S02;S03;S11;S13;S16;S18;S25",confidence="high (telecom); medium-high (DPDP date)"),
 dict(use_case_id="U1b",use_case="Cold B2B outbound to business owners' self-published numbers (own website, Google Business, marketplace listing)",phase="pre-sales",direction_consent_class="outbound / cold (self-published contact)",
  number_series="LWC: as U1 - promotional, so 140xx only [S02 reg 3; S13].",
  dlt_header_template_registration="LWC: as U1 [S02; S03 reg 4].",
  dnd_ncpr_scrubbing="LWC: as U1; many owners' mobiles carry DND, which blocks them [S11].",
  digital_consent_acquisition="NOT-VIABLE for DND numbers (no explicit consent) [S02 def (av)].",
  calling_hours="LWC: 10:00-21:00 default [S01].",
  ai_disclosure_synthetic_voice=AI_DISCLOSE, call_recording=REC,
  dpdp_act_rules="LWC: personal data 'made or caused to be made publicly available by the Data Principal' is outside the Act [S16 s.3(c)(ii)]. Keep provenance (URL, date captured) per record; aggregator-sourced data that the person did not publish is NOT covered (lawyer to confirm the line).",
  sector_rules="N/A: none specific.",platform_policy="N/A",
  penalties_enforcement="INFO: as U1 [S03; S11].",
  status_today_2026_10_17="LWC",status_12m_to_2027_10="LWC (if provenance shows self-publication)",
  verdict_pre_sales="Narrow, lawful niche (SMB-to-SMB selling); volumes small and DND-limited. Not a wedge by itself.",verdict_post_sales="N/A",
  kill_criterion_check="Not triggered if provenance is kept; triggered for DND-registered owners.",
  key_sources="S02;S03;S13;S16",confidence="medium (DPDP public-data line untested)"),
 dict(use_case_id="U2",use_case="Consented lead follow-up (web/ad lead form -> AI call within minutes)",phase="pre-sales",direction_consent_class="outbound / consented (inquiry)",
  number_series="LWC: a sales or qualification call carries promotion, and any promotion makes the whole call promotional, so 140xx [S02 def (av) proviso; S13]. A purely informational reply may be a service call, but one offer line converts it. BFSI service parts on 1600 [S06; S07].",
  dlt_header_template_registration="LWC: registered Sender + 140 CLI + A2P declaration from 2026-11-17 [S02; S03 reg 4]; Consent Template on DLT if consent is to be registered [S02 Sch-I].",
  dnd_ncpr_scrubbing="LWC: non-DND leads reachable on 140 after scrubbing. DND-registered leads need Explicit Consent in the Consent Register [S02 def (av)]. From ~2026-10-18 consent captured outside CRF 'through any verifiable means' counts as explicit once registered in the Consent Register per TRAI procedure [S03 def (y)]; the upload procedure has only been piloted with 11 banks (direction of 2025-12-10) [S03 memo; S09].",
  digital_consent_acquisition="LWC: capture purpose-specific consent on the form with verifiable evidence (form text, timestamp, number, IP). TRAI 'Relationship' on an inquiry: inquiry must be written/digital and kept verifiable; communications allowed for 7 days from the inquiry; on an application, 3 months [S03 def (bb)(ii)-(iii), in force ~2026-10-18; S04].",
  calling_hours="LWC: promotional bands -> 10:00-21:00 default; a lead at 23:00 is called next morning unless the lead opted into that band [S01].",
  ai_disclosure_synthetic_voice=AI_DISCLOSE, call_recording=REC,
  dpdp_act_rules="LWC: s.7(a) legitimate use - data voluntarily provided for a specified purpose, until the person objects (the Act's own illustration is a renter asking a real-estate broker) [S16]. Notice per Rule 3 from ~2027-05-13 [S18]. Children: under-18 leads (coaching/edtech) need verifiable parental consent; no targeted advertising to children [S16 s.9]. VP is a Data Processor under contract [S16 s.8(2)].",
  sector_rules="LWC: insurance leads follow distance-marketing rules [S24]. Lending leads: RE liable for its LSP/agent conduct.",
  platform_policy="LWC: on ad lead forms the advertiser is the fiduciary; keep the platform's consent text as evidence.",
  penalties_enforcement="INFO: on a complaint the telco verifies 'existence of consent', which must appear genuine to an objective, reasonable observer [S03 memo]; otherwise action as U1.",
  status_today_2026_10_17="LWC",status_12m_to_2027_10="LWC (7-day window and DPDP notice become hard requirements)",
  verdict_pre_sales="VIABLE - the strongest pre-sales lane. Conditions: 140 number, 7-day window, verifiable digital inquiry, DND leads only with registered explicit consent, 10:00-21:00, AI disclosure, parental consent for minors from 2027-05.",verdict_post_sales="N/A",
  kill_criterion_check="Not triggered for non-DND leads; partly triggered for DND leads until CRF upload opens to non-banks.",
  key_sources="S01;S02;S03;S04;S09;S16;S18",confidence="high (telecom); medium (CRF availability for non-banks)"),
 dict(use_case_id="U3",use_case="Inbound call handling (customer-initiated; includes a callback the customer asked for)",phase="pre-sales and post-sales",direction_consent_class="inbound",
  number_series="N/A for TCCCPR on the inbound leg (a call the customer places is not a commercial communication sent by a Sender). Numbers (toll-free/virtual/DID) come from a licensed telco or VNO [S26; S27]. A requested callback is an inquiry -> U2 rules if promotional.",
  dlt_header_template_registration="N/A inbound; callbacks by an AI are A2P -> declare from 2026-11-17 [S03 reg 4].",
  dnd_ncpr_scrubbing="N/A inbound.",digital_consent_acquisition="N/A (customer-initiated).",
  calling_hours="N/A (customer chooses).",
  ai_disclosure_synthetic_voice=AI_DISCLOSE, call_recording=REC,
  dpdp_act_rules="LWC: s.7(a) covers processing for the caller's stated purpose; notice and processor contract from ~2027-05-13 [S16; S18].",
  sector_rules="LWC: BFSI/insurance grievance and mis-selling rules apply to what the agent says [S24; S39].",
  platform_policy="N/A",
  penalties_enforcement="INFO: low - no UCC exposure on the inbound leg.",
  status_today_2026_10_17="LAWFUL",status_12m_to_2027_10="LAWFUL (DPDP notice from 2027-05)",
  verdict_pre_sales="VIABLE - lowest friction (inbound sales, missed-call returns).",verdict_post_sales="VIABLE - lowest friction (support, order status, claims intake).",
  kill_criterion_check="Not triggered.",
  key_sources="S03;S16;S18;S20",confidence="high"),
 dict(use_case_id="U4",use_case="Transactional/service outbound (COD/order confirmation, NDR, delivery, appointment reminders, KYC follow-ups)",phase="post-sales",direction_consent_class="outbound / existing customer (service)",
  number_series="LWC by sector: BFSI must use 1600xx (RBI REs by 2026-01-01/02-01/03-01; SEBI MF/AMC 2026-02-15, QSBs 2026-03-15; IRDAI and PFRDA 2026-02-15), and not other numbers even with consent [S06; S07]. Utilities and logistics/courier: 1601xx Phase-I, migration by ~2026-11-08 [S08]. All other sectors (D2C brands, clinics, edtech, real estate): no designated series yet -> 10-digit numbers declared as A2P from 2026-11-17, liable to up to Rs 0.05/min termination charge [S03 reg 4, 35A]; more sectors may be added to 1601 [S08 para 3].",
  dlt_header_template_registration="LWC: CLI ranges declared on DLT for A2P [S03 reg 4]; Sender registered [S02].",
  dnd_ncpr_scrubbing="LAWFUL: BLOCK PROMO and the time-band blocks do not block transactional or service calls [S03 Sch-II Notes; S01 Note-4]. Condition: zero promotional content; mixing makes it promotional/UCC, and on 1600/1601 misuse triggers graded action [S02 def (av); S03 reg 25(4)(f); S08 para 7].",
  digital_consent_acquisition="LWC: transactional = within 30 minutes of a customer-initiated transaction [S02 def (bt)]; service to own customer about a product bought or its delivery needs no explicit consent [S03 def (bh)(i)]; a call to help complete an ongoing purchase (abandoned cart, COD pending) needs explicit consent, valid 7 days [S03 def (bh)(ii)].",
  calling_hours="LAWFUL: TCCCPR time bands do not block service/transactional calls [S03 Notes]; sector rules may (RBI 08:00-19:00 for recovery only).",
  ai_disclosure_synthetic_voice=AI_DISCLOSE, call_recording=REC,
  dpdp_act_rules="LWC: processing for order delivery/appointment is the purpose the customer provided data for (s.7(a)) [S16]; respect retention and objection from ~2027-05-13 [S18].",
  sector_rules="LWC: KYC follow-ups by RBI/SEBI/IRDAI entities are 1600-only [S06; S07]. Healthcare: keep clinical content off channels that regulations bar [S29].",
  platform_policy="N/A",
  penalties_enforcement="INFO: operational risk - telcos' AI flags 10-digit CLIs with high recipient diversity, short calls and few incoming calls [S02 Sch-IV 1(1)(g)]; 'Suspected spam' labels; 5 flagged CLIs in 10 days -> KYC re-verification, then 15-day bar [S03 reg 21A; S10]. 140/1600/1601 are never flagged [S03 reg 21A proviso]. Q1 FY27: 22.99B calls flagged as suspected spam [S11].",
  status_today_2026_10_17="LWC",status_12m_to_2027_10="LWC (A2P declaration live; 1601 likely extends to more sectors)",
  verdict_pre_sales="N/A",verdict_post_sales="VIABLE - lowest-friction outbound lane. Conditions: right series per sector, A2P declared, zero promotion, explicit 7-day consent for purchase-completion calls. Main risk is spam-flagging of 10-digit CLIs for non-designated sectors.",
  kill_criterion_check="Not triggered.",
  key_sources="S01;S02;S03;S06;S07;S08;S10;S11",confidence="high (BFSI/logistics); medium (other sectors' number rules)"),
 dict(use_case_id="U5",use_case="Post-sales feedback / surveys / NPS",phase="post-sales",direction_consent_class="outbound / existing customer",
  number_series="LWC: treat as a service call to own customer about the product or service bought [S03 def (bh)(i)] - the definition does not name surveys, so the classification is an inference (UNCLEAR, lawyer). BFSI 1600; utilities/logistics 1601; others declared 10-digit [S06; S08; S03].",
  dlt_header_template_registration="LWC: A2P declaration [S03 reg 4].",
  dnd_ncpr_scrubbing="LWC: not blocked if purely service; any offer ('rate us, get 10% off') makes it promotional -> 140 + scrub [S02 def (av)].",
  digital_consent_acquisition="N/A if service (i).",
  calling_hours="LAWFUL for service (no TCCCPR band); keep to daytime as practice.",
  ai_disclosure_synthetic_voice=AI_DISCLOSE, call_recording=REC,
  dpdp_act_rules="LWC: feedback is arguably a new purpose -> name it in the notice/consent at purchase (purpose limitation, s.6(1)) from ~2027-05-13 [S16; S18].",
  sector_rules="N/A: none specific found.",platform_policy="N/A",
  penalties_enforcement="INFO: as U4.",
  status_today_2026_10_17="LWC",status_12m_to_2027_10="LWC",
  verdict_pre_sales="N/A",verdict_post_sales="VIABLE with conditions (no incentives or offers in the call; purpose in notice).",
  kill_criterion_check="Not triggered.",
  key_sources="S02;S03;S16",confidence="medium"),
 dict(use_case_id="U6",use_case="Renewals and cross-sell to existing customers",phase="post-sales",direction_consent_class="outbound / existing customer (service + promotional)",
  number_series="LWC (split): renewal or expiry reminder = service (i), from 1600 (BFSI, mandatory) or declared CLI [S03 def (bh)(i); S06; S07]. Cross-sell/upsell = promotional -> separate 140 call [S13]; never inside a 1600/1601 service call [S02 def (av); S08 para 7].",
  dlt_header_template_registration="LWC: both resource types registered; A2P declared [S03].",
  dnd_ncpr_scrubbing="LWC (split): renewal LAWFUL (not blocked); cross-sell LWC - 140 + scrub; DND customers only with Explicit Consent registered (an existing relationship's inferred consent does not override BLOCK PROMO - inference from S03 Sch-II Note-3 and S02 def (av)).",
  digital_consent_acquisition="LWC for cross-sell to DND customers: register explicit consent (CRF; legacy consents uploadable once TRAI opens the procedure) [S03 def (y); S09].",
  calling_hours="LWC (split): renewal has no TCCCPR band; cross-sell 10:00-21:00 default [S01].",
  ai_disclosure_synthetic_voice=AI_DISCLOSE, call_recording=REC,
  dpdp_act_rules="LWC: renewal falls within the contract purpose (s.7(a)); cross-sell is a new purpose -> consent from ~2027-05-13 [S16; S18] (inference, medium-high).",
  sector_rules="LWC: IRDAI insurers make renewal calls on 1600 since 2026-02-15 [S07]; tele-sales rules for any new sale [S24]. RBI REs liable for mis-selling.",
  platform_policy="N/A",
  penalties_enforcement="INFO: promotion on a 1600 number: graded action as TRAI directs [S03 reg 25(4)(f)]; on 140 without scrubbing: complaint action [S03].",
  status_today_2026_10_17="Renewal LWC; cross-sell LWC (constrained)",status_12m_to_2027_10="Renewal LWC; cross-sell needs consent for DND customers and DPDP consent",
  verdict_pre_sales="N/A",verdict_post_sales="Renewal reminders VIABLE (good lane, especially insurance). Cross-sell VIABLE only as a separate 140 call or with registered consent - an 'upsell during the service call' design is unlawful.",
  kill_criterion_check="Cross-sell to DND customers: triggered until consent is registered.",
  key_sources="S01;S02;S03;S06;S07;S13;S24",confidence="medium-high"),
 dict(use_case_id="U7",use_case="Collections / recovery (RBI-regulated lender or its recovery agency)",phase="post-sales",direction_consent_class="outbound / existing borrower (service)",
  number_series="LWC: RBI-regulated lenders must make service/transactional calls only from 1600xx (all categories by 2026-03-01) [S06]. Whether an outsourced recovery agency may use the lender's 1600 numbers is UNCLEAR (1600 is allotted only to regulated entities) [S13].",
  dlt_header_template_registration="LWC: A2P declaration of 1600 CLI ranges from 2026-11-17 [S03 reg 4].",
  dnd_ncpr_scrubbing="LAWFUL: dues reminders are service calls, not blocked by DND [S03 Notes]; no offers in the call.",
  digital_consent_acquisition="N/A (existing contract).",
  calling_hours="LWC: RBI - contact only 08:00-19:00 (existing rule [S23]; restated in amendments effective 2027-01-01, which also treat excessive or out-of-hours calling as a harsh practice [S22]).",
  ai_disclosure_synthetic_voice=AI_DISCLOSE + " RBI recovery rules do not address AI agents [S22]; RBI FREE-AI recommends disclosure (non-binding) [S39].",
  call_recording="LWC: from 2027-01-01 mandatory bi-directional recording, borrower told, 6-month retention, call times and counts logged [S22 secondary; primary CAPTCHA-blocked].",
  dpdp_act_rules="LWC: recovery is within the loan contract's purpose (s.7(a)); contacting references/family is high-risk (DPDP third-party data; RBI bars intimidating family) [S16; S22].",
  sector_rules="LWC (heavy): board recovery policy; code of conduct; recovery agency list; borrower told the agency 1 day before any visit; grievance officer on every communication; IIBF certification for agents within a year; no abusive language, no harassment [S22]. Whether an AI system run by a vendor is a 'recovery agency' (entity other than the lender's own employees engaged to recover dues) is UNCLEAR -> lawyer.",
  platform_policy="LWC: on WhatsApp use utility templates for dues reminders [S31].",
  penalties_enforcement="INFO: RBI supervisory action and reputational exposure; TCCCPR action if promotion is mixed in [S03].",
  status_today_2026_10_17="LWC",status_12m_to_2027_10="LWC (stricter from 2027-01-01)",
  verdict_pre_sales="N/A",verdict_post_sales="VIABLE but the highest conduct burden of any lane; the 2027-01-01 rules are a buying trigger (recording, hours, logs) and a liability (AI-as-agent status unresolved).",
  kill_criterion_check="Not triggered on consent; open legal question on agency status.",
  key_sources="S03;S06;S16;S22;S23;S39",confidence="medium (RBI primary blocked)"),
 dict(use_case_id="U8a",use_case="WhatsApp agent - user-initiated conversations (inbound chat, click-to-WhatsApp ads, 24h window)",phase="pre-sales and post-sales",direction_consent_class="inbound (OTT)",
  number_series="N/A: WhatsApp is not on the TCCCPR telecom-resource regime; TRAI declined stakeholder requests to bring app-based services into its UCC definitions [S03 memo 4.1] (medium).",
  dlt_header_template_registration="N/A.",dnd_ncpr_scrubbing="N/A.",digital_consent_acquisition="N/A (user started it).",calling_hours="N/A.",
  ai_disclosure_synthetic_voice="LWC: automation allowed in the 24h window only with prompt human escalation paths (in-chat transfer, phone, email or web) [S29]. Business-specific AI is fine; general-purpose AI as the primary product is prohibited [S30 s.4.7]. Same IT-Rules SGI question as voice for synthetic audio replies [S20].",
  call_recording="N/A (text); WhatsApp voice calls: as voice.",
  dpdp_act_rules="LWC: s.7(a) for the user's stated purpose [S16]; notice from ~2027-05-13.",
  sector_rules="LWC: no health data where regulations bar it [S29].",
  platform_policy="LWC: free-form messages free inside the 24h service window; utility templates free inside it; click-to-WhatsApp entry opens a 72h free window [S31]. WhatsApp Platform Data may NOT be used to train or improve AI models, except one model for that business's exclusive use [S30 s.4.7] -> no cross-tenant learning from WhatsApp data.",
  penalties_enforcement="INFO: account restriction or permanent ban for policy violations [S29].",
  status_today_2026_10_17="LAWFUL",status_12m_to_2027_10="LAWFUL",
  verdict_pre_sales="VIABLE (CTWA lead chat, qualification).",verdict_post_sales="VIABLE (support, order status).",
  kill_criterion_check="Not triggered; but pooled learning across tenants from WhatsApp data is barred.",
  key_sources="S29;S30;S31",confidence="high"),
 dict(use_case_id="U8b",use_case="WhatsApp agent - business-initiated (template messages; business-initiated WhatsApp calls)",phase="pre-sales and post-sales",direction_consent_class="outbound (OTT) / opted-in vs cold",
  number_series="N/A (OTT).",dlt_header_template_registration="N/A for TRAI; Meta template approval by category instead [S31].",dnd_ncpr_scrubbing="N/A.",
  digital_consent_acquisition="LWC: contact only people who gave their number AND opted in to receive messages from you; separate opt-in for calls advised [S29]; business-initiated WhatsApp calls need the user's call permission (permanent permission available since 2025-11-03) [S33]. NOT-VIABLE cold: no opt-in, and the owner's CommandCentre measured cold marketing templates dropped with error 131049 [S37].",
  calling_hours="N/A by law; respect user expectations.",
  ai_disclosure_synthetic_voice="LWC: as U8a [S29; S30; S20].",call_recording="LWC: WhatsApp calls follow the voice rules (announce recording; DPDP notice) [S16].",
  dpdp_act_rules="LWC: marketing needs consent from ~2027-05-13; service updates fall under s.7(a) [S16; S18].",
  sector_rules="LWC: sector content rules apply (e.g. no promotion in BFSI service flows by analogy) [S24].",
  platform_policy="LWC: India per-message rates from 2026-10-01: marketing Rs 0.8631, utility Rs 0.115, authentication Rs 0.115, authentication-international Rs 2.4971 [S31 measured from rate card]. Per-user marketing caps across all businesses are dynamic (error 131049) and apply to India [S32]. Business-initiated calling available in India; 10,000 call initiations per number per 24h [S33]. INR billing migration by 2026-12-31 [S31].",
  penalties_enforcement="INFO: quality rating / messaging-limit throttles; account bans [S29].",
  status_today_2026_10_17="LWC (opted-in); NOT-VIABLE (cold)",status_12m_to_2027_10="LWC (opted-in); NOT-VIABLE (cold)",
  verdict_pre_sales="Opted-in follow-up VIABLE (cheap utility/marketing templates); cold NOT-VIABLE.",verdict_post_sales="VIABLE (utility templates are cheap; WhatsApp calls with permission).",
  kill_criterion_check="Cold: TRIGGERED (opt-in cannot be produced).",
  key_sources="S29;S31;S32;S33;S37",confidence="high"),
 dict(use_case_id="U9",use_case="Email campaigns (B2B and B2C)",phase="pre-sales and post-sales",direction_consent_class="outbound (email)",
  number_series="N/A.",dlt_header_template_registration="N/A.",dnd_ncpr_scrubbing="N/A (no Indian email DND register found).",
  digital_consent_acquisition="N/A under TRAI; consent is a DPDP question.",calling_hours="N/A.",
  ai_disclosure_synthetic_voice="N/A for text; misleading-advertising and dark-pattern rules apply to content (false urgency, disguised ads) [S21].",
  call_recording="N/A.",
  dpdp_act_rules="LAWFUL today; from ~2027-05-13 LWC: an individual's email (including a named work email) is personal data -> consent or s.7(a); purchased lists NOT-VIABLE; self-published addresses outside the Act [S16 s.3(c)(ii); S18].",
  sector_rules="UNCLEAR: no India-specific anti-spam statute found (gap; lawyer to confirm).",
  platform_policy="LWC: Gmail bulk senders (>5,000/day): SPF+DKIM+DMARC, one-click unsubscribe, spam rate below 0.30% [S34]. Foreign recipients: GDPR/CAN-SPAM (out of scope).",
  penalties_enforcement="INFO: CCPA reported Rs 20 lakh in penalties across 7 dark-pattern cases reported [S21]; deliverability penalties by mailbox providers [S34].",
  status_today_2026_10_17="LWC (deliverability rules)",status_12m_to_2027_10="LWC for consented/self-published; NOT-VIABLE for purchased B2C lists",
  verdict_pre_sales="Consented nurture VIABLE; bought-list cold email loses its legal basis in May 2027.",verdict_post_sales="VIABLE.",
  kill_criterion_check="Purchased lists from 2027-05: triggered.",
  key_sources="S16;S18;S21;S34",confidence="medium"),
]

TIMELINE = [
 ("2024-08-13","TRAI direction: promotional calls from unregistered SIP/PRI to stop; disconnection + blacklisting across telcos","S05","in force"),
 ("2025-03-14","TCCCPR Second Amendment main provisions in force (30 days after 2025-02-12): new call categories; 140/special-series-only rule; autodialer/robocall intimation","S02","in force (computed)"),
 ("2025-04-13","TCCCPR Second Amendment reg 8/17/20/21 in force (complaint mechanism, sender verification, UCC_Detect signals)","S02","in force (computed)"),
 ("2025-11-14","DPDP Rules notified; Board provisions in force","S17;S18","in force"),
 ("2026-01-01","1600 mandatory: commercial banks (Phase-I RBI)","S06","in force"),
 ("2026-02-01","1600 mandatory: large NBFCs (>Rs 5,000 cr), payments banks, SFBs","S06","in force"),
 ("2026-02-15","1600 mandatory: all IRDAI entities; SEBI MFs/AMCs; PFRDA CRAs/PFM-PoP","S06;S07","in force"),
 ("2026-02-20","IT Rules amendment on synthetically generated information in force (audio disclosure for SGI tools)","S20","in force"),
 ("2026-03-01","1600 mandatory: remaining NBFCs, co-operative banks, RRBs","S06","in force"),
 ("2026-03-13","Draft TCCCPR Third Amendment released for consultation (no AI-disclosure clause)","S04;S14","historical"),
 ("2026-03-15","1600 mandatory: SEBI qualified stockbrokers","S06","in force"),
 ("2026-06-23","Telecom authorisation rules 2026 (principal telecommunication services) in force","S26;S03","in force"),
 ("2026-06-23","Telcos start warning notifications to suspected spam senders","S11","in force"),
 ("2026-08-10","1601 series allocation begins (utilities; logistics and courier)","S08","in force"),
 ("2026-10-01","WhatsApp India rate card (marketing Rs 0.8631 / utility Rs 0.115)","S31","in force"),
 ("2026-10-18","TCCCPR Third Amendment main provisions in force (30 days after 2026-09-18): 7-day inquiry window; legacy explicit consents; AI-flag action (21A); complaint thresholds; CMA rules","S03","upcoming (computed)"),
 ("2026-11-01","CNAP caller-name display rollout (news)","S35","upcoming (secondary)"),
 ("2026-11-02","FULLY BLOCK preferences migrated to BLOCK PROMO (within 15 days of commencement)","S03","upcoming (computed)"),
 ("2026-11-08","1601 Phase-I onboarding/migration deadline (90 days from 2026-08-10)","S08","upcoming (computed)"),
 ("2026-11-13","DPDP Rule 4 (consent managers) in force (some sources: 2026-11-14)","S18","upcoming"),
 ("2026-11-17","TCCCPR Third Amendment 60-day provisions: A2P pre-declaration with CLI ranges on DLT; A2P termination charge up to Rs 0.05/min (designated series exempt); VNO DLT interface; header-misuse regime","S03","upcoming (computed)"),
 ("2026-12-17","TCCCPR Third Amendment 90-day provisions: consumer appeal mechanism; complaint corroboration with AI-flag data; wrong-category template proviso","S03","upcoming (computed)"),
 ("2026-12-31","WhatsApp: eligible Indian WABAs must migrate billing to INR (non-INR stop delivering from 2027-01-01)","S31","upcoming"),
 ("2027-01-01","RBI recovery-conduct amendments in force for banks, NBFCs, HFCs, co-ops, AIFIs: 08:00-19:00, call recording 6 months, agency rules","S22","upcoming (secondary)"),
 ("2027-05-13","DPDP core obligations in force: notice, consent, children, security, rights, retention (some sources: 2027-05-14)","S17;S18","upcoming"),
]

ENFORCEMENT = [
 ("Q1 FY2026-27 (Apr-Jun 2026)","UCC complaints registered","1,085,000","S11"),
 ("Q1 FY2026-27","Actionable complaints","553,000","S11"),
 ("Q1 FY2026-27","Telecom resources barred 15 days (1st violation)","137,053","S11"),
 ("Q1 FY2026-27","Telecom resources disconnected 1 year (repeat)","46,786","S11"),
 ("Q1 FY2026-27","Senders blacklisted 1 year","263","S11"),
 ("Q1 FY2026-27","SMS headers blocked","2,873","S11"),
 ("Q1 FY2026-27","Promotional calls originated on 140 series","13.16 billion","S11"),
 ("Q1 FY2026-27","140-series calls blocked by DND preferences","1.48 billion (11.2% computed)","S11"),
 ("Q1 FY2026-27","Calls originated from 1600 series","1.15 billion","S11"),
 ("Q1 FY2026-27","Incoming calls flagged by telco AI as suspected spam","22.99 billion of 721.79 billion (3.2% computed)","S11"),
 ("Q1 FY2026-27","Warning notifications to suspected spam senders (from 2026-06-23)","243,000","S11"),
 ("as of 2026-06-30","Preferences registered on DND registry","224 million of 1.348 billion subscribers (16%)","S11"),
 ("April 2026","Disconnections for UCC violations; of which SIP/PRI (A2P)","20,591; 15,736 (~75%)","S03 memo"),
 ("2025 (calendar)","Notices to unregistered telemarketers","731,120","S12"),
 ("2025","Entities under 1-month communication restriction","473,075","S12"),
 ("2025","Repeat offenders under 6-month caps","89,936","S12"),
 ("2025","Telecom resources disconnected","184,482","S12"),
 ("Aug 2024 to Jan 2026","Telecom resources disconnected cumulatively","21.05 lakh","S12"),
 ("2025","UCC complaints (all channels); via DND app","31.09 lakh; 17.06 lakh","S12"),
 ("Feb 2026 direction","Share of UCC complaints against unregistered telemarketers","~85%","S10"),
]

WA_RATES = [
 ("India","INR","2026-10-01","marketing","0.8631"),("India","INR","2026-10-01","utility","0.115"),
 ("India","INR","2026-10-01","authentication","0.115"),("India","INR","2026-10-01","authentication-international","2.4971"),
 ("India","INR","2026-10-01","service (column in rate card)","0.115"),
 ("India","USD","2026-10-01","marketing","0.0118"),("India","USD","2026-10-01","utility","0.0014"),
 ("India","USD","2026-10-01","authentication","0.0014"),("India","USD","2026-10-01","authentication-international","0.0304"),
]

def w(name, header, rows):
    with open(os.path.join(HERE, name), "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f); wr.writerow(header); wr.writerows(rows)

def main():
    w("usecase-map.csv", COLS, [[r[c] for c in COLS] for r in ROWS])
    long_rows = []
    for r in ROWS:
        for c in COLS[4:15]:
            cell = r[c]; status = cell.split(":")[0].split(" ")[0].strip()
            status = status.rstrip(".")
            if status not in ("LAWFUL","LWC","NOT-VIABLE","N/A","UNCLEAR","INFO"):
                status = "SEE-TEXT"
            long_rows.append([r["use_case_id"], r["use_case"], c, status, cell])
    w("usecase-map-long.csv", ["use_case_id","use_case","dimension","status","cell_text"], long_rows)
    w("sources.csv", ["id","title","url","pub_or_effective_date","accessed","method","confidence","note"], SOURCES)
    w("blocked-sources.csv", ["host","failure","what_it_would_have_given"], BLOCKED)
    w("timeline.csv", ["date","event","source_ids","status"], TIMELINE)
    w("enforcement-stats.csv", ["period","metric","value","source_id"], ENFORCEMENT)
    w("whatsapp-india-rates.csv", ["market","currency","effective","category","price_per_message"], WA_RATES)
    print("wrote", len(ROWS), "use cases,", len(long_rows), "cells,", len(SOURCES), "sources")

if __name__ == "__main__":
    main()
