# VP evidence ledger (rounds 1 and 2)

Date: 2026-10-17. Machine-readable version: `ledger.json` (same entries, same ids). Built by the round-2 synthesis from the lane files, the round-1 and round-2 verifier reports and `lanes/CORRECTIONS-round2.md`. Source URLs were resolved from the lanes' own `sources.csv` files by id or copied verbatim from lane files; repo-relative paths point to our own measurements and models.

**How to read an entry.** *method* is one of read-primary, read-secondary, measured, computed, vendor-claim or assumption (combinations are written out). *verifier* is the adversarial verifier's verdict where one ran; round-2 packages without a verifier (competition, untouched raw, founder kit, listener panel) say "not verified". *supersedes* names the earlier claim or ledger id this entry replaces; superseded entries are kept, not deleted.

| section | entries | round 1 | round 2 |
|---|---|---|---|
| Regulation (TRAI, IRDAI, RBI, DPDP, ACS) (`REG`) | 35 | 15 | 20 |
| TRAI stakeholder record, 1600 and CNAP, fraud, tenders, voice of customer (`RAW`) | 16 | 0 | 16 |
| Cost of the stack and market prices (`ECO`) | 24 | 14 | 10 |
| Per-renewal economics and insurance pain (`REN`) | 26 | 2 | 24 |
| Segments, sizing and expansion (`SEG`) | 13 | 8 | 5 |
| Competition and distribution (`CMP`) | 27 | 14 | 13 |
| Latency, speech and model behaviour (`LAT`) | 19 | 7 | 12 |
| Learning and experimentation (H7) (`LRN`) | 9 | 9 | 0 |
| Human-likeness, language, dialect and the listener panel (`HUM`) | 14 | 7 | 7 |
| Founder kit (pre-registered interview rules) (`FK`) | 5 | 0 | 5 |
| Round-1 SYNTHESIS positions superseded in round 2 (`SYN1`) | 12 | 12 | 0 |
| **total** | **200** | **88** | **112** |

Verifier verdicts across all entries: confirmed 54, weakened 52, not verified 41, other 33, superseded 12, n/a 3, unsourced 2, corrected 1, unverified 1, refuted 1.

## Regulation (TRAI, IRDAI, RBI, DPDP, ACS)

**REG-01** (round 1, l1). Registered senders may lawfully make promotional (including AI) calls from 140xx numbers to subscribers without a DND preference; 224M of 1.348bn subscribers (16.6%, TRAI rounds to 16%) have one.
- Value: 224M of 1.348bn (16.6%); ~1.12bn reachable (subscribers). Date: 2026-08-04. Method: read-primary. Confidence: high.
- Verifier: confirmed (l1 verifier).
- Sources: https://www.trai.gov.in/sites/default/files/2026-08/PR_No111of2026.pdf; https://trai.gov.in/sites/default/files/2026-07/PR_No91of2026.pdf; https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf

**REG-02** (round 1, l1). 140-series calls in Q1 FY27: 13.16bn originated, 1.48bn blocked by DND scrubbing.
- Value: 13.16bn / 1.48bn (11.25%) (calls per quarter). Date: 2026-08-04. Method: read-primary. Confidence: high.
- Verifier: confirmed (l1 and l3 verifiers).
- Sources: https://www.trai.gov.in/sites/default/files/2026-08/PR_No111of2026.pdf

**REG-03** (round 1, l1). 1600-series calls in Q1 FY27.
- Value: 1.15bn (calls per quarter). Date: 2026-08-04. Method: read-primary. Confidence: high.
- Verifier: confirmed.
- Sources: https://www.trai.gov.in/sites/default/files/2026-08/PR_No111of2026.pdf

**REG-04** (round 1, l1). Calls flagged as suspected spam by telco AI in Q1 FY27.
- Value: 22.99bn of 721.79bn (calls per quarter). Date: 2026-08-04. Method: read-primary. Confidence: high.
- Verifier: confirmed.
- Sources: https://www.trai.gov.in/sites/default/files/2026-08/PR_No111of2026.pdf

**REG-05** (round 1, l1). DPDP core obligations (notice, consent, children's data, rights) apply from about 2027-05-13 (18-month phase-in from the Rules notified 2025-11-14); no legitimate-interest ground; s.7(a) illustration is a real-estate broker.
- Value: ~2027-05-13 (date). Date: 2025-11-17. Method: read-primary (Act) / read-secondary (dates; egazette blocked). Confidence: medium.
- Verifier: confirmed (dates from secondary sources).
- Sources: https://www.trai.gov.in/sites/default/files/2024-09/DPDT_11082024.pdf; https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf; https://www.barandbench.com/view-point/meity-notifies-final-digital-personal-data-protection-rules-2025; https://dpdpa.dcomply.in/rules/

**REG-06** (round 1, l1). No TRAI instrument requires an AI caller to disclose it is AI; the harvest claim of TRAI outbound-AI rules in force since 2026-03-10 traces to a vendor blog and is unsupported.
- Value: no disclosure duty in TRAI text (finding). Date: 2026-10-17. Method: read-primary. Confidence: high.
- Verifier: weakened (core confirmed). **Supersedes:** harvest: 'TRAI outbound-AI rules since 2026-03-10'.
- Sources: https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf; https://www.trai.gov.in/release-publication/consultation; https://www.trai.gov.in/release-publication/directions; https://qcall.ai/trai-updates-for-ai-calling

**REG-07** (round 1, l1). A2P (automated or artificial-voice) calls and CLI ranges must be pre-declared to the originating operator; undeclared A2P calls are UCC; termination charge up to INR 0.05/min with 140/1600/1601 exempt; commencement 60 days after Gazette publication.
- Value: ~2026-11-17 (date). Date: 2026-09-18. Method: read-primary. Confidence: high.
- Verifier: confirmed.
- Sources: https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf

**REG-08** (round 1, l1). Any promotional content mixed into a commercial call makes the whole call promotional; cross-sell, upsell and offers to existing customers cannot ride as service messages.
- Value: one offer line -> promotional (rule). Date: 2025-02-12. Method: read-primary. Confidence: high.
- Verifier: confirmed (l1 verifier; re-confirmed by r2 verifier).
- Sources: https://www.trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf

**REG-09** (round 1, l1). TRAI 'relationship' on a verifiable written/digital inquiry allows promotional contact for 7 days (30-day commencement after Gazette publication).
- Value: 7 days, from ~2026-10-18 (window). Date: 2026-09-18. Method: read-primary. Confidence: high.
- Verifier: weakened (row-level; quoted rules confirmed).
- Sources: https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf; https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2311989&lang=1&reg=3

**REG-10** (round 1, l1). BFSI service and transactional calls only from 1600xx 'even with consent': banks 2026-01-01; large NBFCs, payments banks, SFBs 2026-02-01; other NBFCs, co-ops, RRBs 2026-03-01; IRDAI entities 2026-02-15; SEBI MFs/AMCs 2026-02-15; PFRDA 2026-02-15.
- Value: deadlines Jan-Mar 2026 (dates). Date: 2025-12-16. Method: read-primary. Confidence: high.
- Verifier: confirmed (deadlines); row weakened on other points.
- Sources: https://www.trai.gov.in/sites/default/files/2025-11/Direction_19112025.pdf; https://www.trai.gov.in/sites/default/files/2025-12/Direction_16122025.pdf

**REG-12** (round 1, l1). TRAI treats a cloud-communications platform as a sender/aggregator, not an access provider; one client's misuse of an intermediary's CLIs bars all of that intermediary's resources (15-day bar, then 1-year disconnection).
- Value: reseller liability (rule). Date: 2026-09-18. Method: read-primary. Confidence: high.
- Verifier: weakened (core confirmed; correction on remedy detail).
- Sources: https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf

**REG-13** (round 1, l1 / r2-regulation-insurance). RBI-regulated lenders from 2027-01-01: recovery contact only 08:00-19:00; every recovery call recorded both ways with notice, kept 6 months; a recovery agency is any entity other than the lender's own employees.
- Value: 2027-01-01 (date). Date: 2026-08-06. Method: read-primary. Confidence: high.
- Verifier: confirmed (upgraded to primary; re-confirmed in round 2).
- Sources: https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=13672&Mode=0; https://www.corplawupdates.in/updates/rbi-amendment-directions-recovery-agents-loan-dues-2026; primary https://rbidocs.rbi.org.in/rdocs/notification/PDFs/NT230A919C5A725694DD78C1C3640B455C4E9.PDF (CAPTCHA-blocked)

**REG-14** (round 1, l1). WhatsApp India rate card effective 2026-10-01: utility template INR 0.115 vs marketing INR 0.8631; service window messages free.
- Value: 0.115 vs 0.8631 (INR per message). Date: 2026-10-01. Method: read-primary. Confidence: high.
- Verifier: confirmed (l3 verifier).
- Sources: https://developers.facebook.com/docs/whatsapp/pricing/

**REG-15** (round 1, l4c). RBI e-mandate: recurring card/PPI/UPI debits without additional authentication up to INR 15,000 (INR 1 lakh for insurance premiums); NACH/e-NACH is outside this Direction.
- Value: 15,000 (1,00,000 insurance) (INR per debit). Date: 2026-04-21. Method: read-primary. Confidence: high.
- Verifier: weakened (inference about invoicing; facts exact).
- Sources: https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=13374

**REG-17** (round 1, l1). MeitY IT Rules amendment (in force 2026-02-20) requires audio disclosure and provenance metadata from intermediaries offering synthetic-audio tools; applicability to a B2B voice SaaS unclear.
- Value: 2026-02-20 (date). Date: 2026-02-10. Method: read-secondary. Confidence: medium.
- Verifier: not separately verified.
- Sources: https://www.amsshardul.com/wp-content/uploads/2026/02/Legislative-Update-IT-Rules-Amendment.pdf

**REG-20** (round 2, r2-regulation-insurance). IRDAI circular IRDAI/PP&GR/CIR/MISC/02/01/2026 is addressed to 'All Insurers and Insurance Intermediaries' and requires 1600 numbers for all service and transactional voice calls from 2026-02-15 'irrespective of explicit or inferred customer consent'; non-compliance attracts TRAI unregistered-telemarketer action plus IRDAI action.
- Value: mandatory for brokers, CAs, IMFs, WAs (scope). Date: 2026-01-06. Method: read-primary. Confidence: high.
- Verifier: confirmed (r2 verifier re-downloaded; paras 2(i)-(iii) verbatim). **Supersedes:** SYN1-03.
- Sources: https://irdai.gov.in/documents/37343/365525/1600-%E0%A4%B6%E0%A5%83%E0%A4%82%E0%A4%96%E0%A4%B2%E0%A4%BE+%E0%A4%95%E0%A5%87+%E0%A4%85%E0%A4%A8%E0%A4%BF%E0%A4%B5%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%AF+%E0%A4%85%E0%A4%82%E0%A4%97%E0%A5%80%E0%A4%95%E0%A4%B0%E0%A4%A3+%E0%A4%B8%E0%A4%82%E0%A4%AC%E0%A4%82%E0%A4%A7%E0%A5%80+%E0%A4%9F%E0%A5%8D%E0%A4%B0%E0%A4%BE%E0%A4%88+%28%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4%E0%A5%80%E0%A4%AF+%E0%A4%A6%E0%A5%82%E0%A4%B0%E0%A4%B8%E0%A4%82%E0%A4%9A%E0%A4%BE%E0%A4%B0+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%BE%E0%A4%AE%E0%A4%95+%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%BE%E0%A4%A7%E0%A4%BF%E0%A4%95%E0%A4%B0%E0%A4%A3%29+%E0%A4%95%E0%A5%87+%E0%A4%A8%E0%A4%BF%E0%A4%A6%E0%A5%87%E0%A4%B6+%E0%A4%95%E0%A4%BE+%E0%A4%95%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%AF%E0%A4%BE%E0%A4%A8%E0%A5%8D%E0%A4%B5%E0%A4%AF%E0%A4%A8+_+Implementation+of+1600+Series+TRAI+directions.pdf/c8e0e0d1-4359-b70a-da07-63c175e8491b?version=1.0&t=1767791333736&download=true; https://www.trai.gov.in/sites/default/files/2025-12/Direction_16122025.pdf

**REG-21** (round 2, r2-regulation-insurance). The TRAI IRDAI direction has no annexure, phasing or carve-out, unlike the RBI/SEBI/PFRDA direction where other SEBI intermediaries are 'voluntary adoption for time being'.
- Value: no carve-out (finding). Date: 2025-12-16. Method: read-primary. Confidence: high.
- Verifier: confirmed (sha256 matches round-1 copy).
- Sources: https://www.trai.gov.in/sites/default/files/2025-12/Direction_16122025.pdf; https://www.trai.gov.in/sites/default/files/2025-11/Direction_19112025.pdf; https://trai.gov.in/sites/default/files/2025-11/PR_No.135of2025.pdf

**REG-22** (round 2, r2-regulation-insurance). 1600 numbers are obtainable in principle: IRDAI's circular lists nodal officers at 8 access providers; Plivo provisions via Tata DLT with the regulator certificate and one NOC per number and requires the telemarketer to be registered in Mumbai or Karnataka; Vobiz lists LOI, GST, PAN, KYC and DLT IDs.
- Value: 8 access providers; Plivo, Vobiz, Tata, Jio documented (providers). Date: 2026-10-17. Method: read-primary / vendor-claim; n = 8. Confidence: medium.
- Verifier: weakened (timeline misquoted; path confirmed).
- Sources: https://irdai.gov.in/documents/37343/365525/1600-%E0%A4%B6%E0%A5%83%E0%A4%82%E0%A4%96%E0%A4%B2%E0%A4%BE+%E0%A4%95%E0%A5%87+%E0%A4%85%E0%A4%A8%E0%A4%BF%E0%A4%B5%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%AF+%E0%A4%85%E0%A4%82%E0%A4%97%E0%A5%80%E0%A4%95%E0%A4%B0%E0%A4%A3+%E0%A4%B8%E0%A4%82%E0%A4%AC%E0%A4%82%E0%A4%A7%E0%A5%80+%E0%A4%9F%E0%A5%8D%E0%A4%B0%E0%A4%BE%E0%A4%88+%28%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4%E0%A5%80%E0%A4%AF+%E0%A4%A6%E0%A5%82%E0%A4%B0%E0%A4%B8%E0%A4%82%E0%A4%9A%E0%A4%BE%E0%A4%B0+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%BE%E0%A4%AE%E0%A4%95+%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%BE%E0%A4%A7%E0%A4%BF%E0%A4%95%E0%A4%B0%E0%A4%A3%29+%E0%A4%95%E0%A5%87+%E0%A4%A8%E0%A4%BF%E0%A4%A6%E0%A5%87%E0%A4%B6+%E0%A4%95%E0%A4%BE+%E0%A4%95%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%AF%E0%A4%BE%E0%A4%A8%E0%A5%8D%E0%A4%B5%E0%A4%AF%E0%A4%A8+_+Implementation+of+1600+Series+TRAI+directions.pdf/c8e0e0d1-4359-b70a-da07-63c175e8491b?version=1.0&t=1767791333736&download=true; https://www.plivo.com/docs/voice/concepts/160-series-provisioning; https://vobiz.ai/docs/best-practices/140-160-acquisition; https://docs.vobiz.ai/faq/number-series; https://www.tatatelebusiness.com/marketing-solutions/1600-phone-number-series/; https://www.jio.com/business/offer/sip-1600-series/

**REG-23** (round 2, r2-regulation-insurance). Plivo's stated end-to-end 1600 provisioning time.
- Value: ~7-14 (business days). Date: 2026-10-17. Method: vendor-claim. Confidence: medium.
- Verifier: corrected by r2 verifier (package said 7-12; step ranges sum to 7-12 but Plivo states 7-14). **Supersedes:** r2 package claim '~7-12 business days'.
- Sources: https://www.plivo.com/docs/voice/concepts/160-series-provisioning

**REG-24** (round 2, r2-regulation-insurance). No telco or CPaaS publishes a 1600 price (per number, circle or minute).
- Value: none published (price). Date: 2026-10-17. Method: vendor-claim (bounded negative). Confidence: medium.
- Verifier: confirmed (two independent searches).
- Sources: https://www.tatatelebusiness.com/marketing-solutions/1600-phone-number-series/; https://www.plivo.com/docs/voice/concepts/160-series-provisioning; https://vobiz.ai/docs/best-practices/140-160-acquisition; https://docs.vobiz.ai/faq/number-series; https://www.jio.com/business/offer/sip-1600-series/

**REG-25** (round 2, r2-regulation-insurance). No telco or CPaaS page explicitly states that WebSocket/SIP media streaming to a third-party AI gateway works on 1600 lines (Plivo Stream page's '160' hits are 16000 Hz; Exotel banks blog links 1600 onboarding and a voicebot but contains series errors).
- Value: not documented (finding). Date: 2026-10-17. Method: vendor-claim (bounded negative). Confidence: medium.
- Verifier: confirmed (bounded negative; Airtel/Vi unreachable).
- Sources: https://www.plivo.com/docs/voice/xml/audio-streaming; https://exotel.com/blog/1600-phone-number/; https://exotel.com/blog/outbound-voice-ai-banks-fast-implementation-2026/

**REG-26** (round 2, r2-regulation-insurance). IRDAI PPHI Regulations 2024 reg 5(13) (Part A definitions) define solicitation as approaching a prospect or policyholder 'with a view to persuading ... to purchase or to renew'; the Brokers Regs def (t) and WA Regs def (m) define it as purchase only; so 'renewal persuasion by phone needs a certified human' is a conservative reading, not settled text.
- Value: renewal persuasion = solicitation (PPHI Part A) (rule). Date: 2024-03-20. Method: read-primary + interpretation. Confidence: medium.
- Verifier: weakened (citation 3(13)->5(13); confidence high->medium).
- Sources: https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%AA%E0%A4%BE%E0%A4%B2%E0%A4%BF%E0%A4%B8%E0%A5%80%E0%A4%A7%E0%A4%BE%E0%A4%B0%E0%A4%95%E0%A5%8B%E0%A4%82+%E0%A4%95%E0%A5%87+%E0%A4%B9%E0%A4%BF%E0%A4%A4%E0%A5%8B%E0%A4%82+%E0%A4%95%E0%A4%BE+%E0%A4%B8%E0%A4%82%E0%A4%B0%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%A3%2C+%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE%E0%A4%95%E0%A4%B0%E0%A5%8D%E0%A4%A4%E0%A4%BE%E0%A4%93%E0%A4%82+%E0%A4%95%E0%A5%87+%E0%A4%AA%E0%A4%B0%E0%A4%BF%E0%A4%9A%E0%A4%BE%E0%A4%B2%E0%A4%A8+%E0%A4%94%E0%A4%B0+%E0%A4%B8%E0%A4%82%E0%A4%AC%E0%A4%A6%E0%A5%8D%E0%A4%A7+%E0%A4%95%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%AF%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2024+_+IRDAI+%28Protection+of+Policyholder%27s+Interests%2C+operations+and+allied+matters+of+insurers%29+Regulations%2C+2024.pdf/330674c5-0adb-4eb7-a399-95d779246ff8?version=1.2&t=1712320815911&download=true; https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%A6%E0%A4%B2%E0%A4%BE%E0%A4%B2%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2018+_+IRDAI+%28Insurance+Brokers%29+Regulations%2C+2018.pdf/c36673a4-d5ef-2651-ff7e-917c3bae12ca?version=1.1&t=1687411185151&download=true; https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%B5%E0%A5%87%E0%A4%AC+%E0%A4%8F%E0%A4%97%E0%A5%8D%E0%A4%B0%E0%A5%80%E0%A4%97%E0%A5%87%E0%A4%9F%E0%A4%B0%E0%A5%8D%E0%A4%B8%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2017_+IRDAI+%28Insurance+Web+Aggregators%29+Regulations%2C+2017.pdf/79cf80a0-36b5-0708-5d0e-535f85efadca?version=1.1&t=1687411257165&download=true

**REG-27** (round 2, r2-regulation-insurance). Inside the telemarketing channel only Authorised Verifiers may solicit and conclude sales, using insurer-approved standardised scripts, explicit consent, the AV's name and IRDAI certificate number, a language choice and a recording notice (CA Regs Sch VII; WA Regs schedule).
- Value: AV-only solicitation (rule). Date: 2015-09-15. Method: read-primary. Confidence: high.
- Verifier: confirmed.
- Sources: https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%95%E0%A5%89%E0%A4%B0%E0%A5%8D%E0%A4%AA%E0%A5%8B%E0%A4%B0%E0%A5%87%E0%A4%9F+%E0%A4%8F%E0%A4%9C%E0%A5%87%E0%A4%82%E0%A4%9F%E0%A5%8B%E0%A4%82+%E0%A4%95%E0%A4%BE+%E0%A4%AA%E0%A4%82%E0%A4%9C%E0%A5%80%E0%A4%95%E0%A4%B0%E0%A4%A3%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2015+_+IRDAI+%28Registration+of+Corporate+Agents%29+Regulations%2C+2015.pdf/8b4d18bc-463a-1034-b4d8-cefa1a3b6b6a?version=1.2&t=1687437802212&download=true; https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%B5%E0%A5%87%E0%A4%AC+%E0%A4%8F%E0%A4%97%E0%A5%8D%E0%A4%B0%E0%A5%80%E0%A4%97%E0%A5%87%E0%A4%9F%E0%A4%B0%E0%A5%8D%E0%A4%B8%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2017_+IRDAI+%28Insurance+Web+Aggregators%29+Regulations%2C+2017.pdf/79cf80a0-36b5-0708-5d0e-535f85efadca?version=1.1&t=1687411257165&download=true; https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%A6%E0%A4%B2%E0%A4%BE%E0%A4%B2%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2018+_+IRDAI+%28Insurance+Brokers%29+Regulations%2C+2018.pdf/c36673a4-d5ef-2651-ff7e-917c3bae12ca?version=1.1&t=1687411185151&download=true

**REG-28** (round 2, r2-regulation-insurance). The IRDAI telemarketer regime survives the July 2026 amendment (CA reg 25 retained; AV certificates become a Letter of Enrolment with a pre-recruitment test); the register lists 38 telemarketer certificates tied to corporate agents, all with validity ending 2020-2023.
- Value: 38 certificates, all stale (register entries). Date: 2026-07-30. Method: read-primary; n = 38. Confidence: high.
- Verifier: confirmed (verifier re-fetched register live).
- Sources: https://irdai.gov.in/documents/37343/366405/IRDAI+%28Insurance+Intermediaries%29+%28Amendment%29+Regulations%2C+2026.pdf/4961106d-b7f4-c117-a302-4bf3ef9356c5?version=1.0&t=1785736027526&download=true; https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%95%E0%A5%89%E0%A4%B0%E0%A5%8D%E0%A4%AA%E0%A5%8B%E0%A4%B0%E0%A5%87%E0%A4%9F+%E0%A4%8F%E0%A4%9C%E0%A5%87%E0%A4%82%E0%A4%9F%E0%A5%8B%E0%A4%82+%E0%A4%95%E0%A4%BE+%E0%A4%AA%E0%A4%82%E0%A4%9C%E0%A5%80%E0%A4%95%E0%A4%B0%E0%A4%A3%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2015+_+IRDAI+%28Registration+of+Corporate+Agents%29+Regulations%2C+2015.pdf/8b4d18bc-463a-1034-b4d8-cefa1a3b6b6a?version=1.2&t=1687437802212&download=true; https://irdai.gov.in/list-of-telemarketer1

**REG-29** (round 2, r2-regulation-insurance). IMF Regulations reg 3(d): an IMF may do distance marketing only without engaging telemarketers, with prior IRDAI approval, only through its own ISPs, for tied insurers; the 2026 amendment does not touch it and gives IMFs no digital-platform proviso.
- Value: IMFs may not use telemarketers (rule). Date: 2019-07-26. Method: read-primary. Confidence: high.
- Verifier: confirmed.
- Sources: https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%B5%E0%A4%BF%E0%A4%AA%E0%A4%A3%E0%A4%A8+%E0%A4%AB%E0%A4%B0%E0%A5%8D%E0%A4%AE+%E0%A4%95%E0%A4%BE+%E0%A4%AA%E0%A4%82%E0%A4%9C%E0%A5%80%E0%A4%95%E0%A4%B0%E0%A4%A3%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2015+_+IRDAI+%28Registration+Of+Insurance+Marketing+Firm%29+Regulations+2015.pdf/b54d8c87-d417-b55c-f076-e5050b9ba55b?version=1.3&t=1687411160802&download=true; https://irdai.gov.in/documents/37343/366405/IRDAI+%28Insurance+Intermediaries%29+%28Amendment%29+Regulations%2C+2026.pdf/4961106d-b7f4-c117-a302-4bf3ef9356c5?version=1.0&t=1785736027526&download=true

**REG-30** (round 2, r2-regulation-insurance). Brokers Regs 2018: core functions in Schedule I Form A (advice, quotations, help with premium payment) may not be outsourced 'in any manner whatsoever'; telemarketing outsourcing only 'to the extent of tele-calling'; Code of Conduct para 6 obliges the broker to make sure the client knows the expiry date and receives the renewal notice.
- Value: core functions non-outsourceable (rule). Date: 2018-01-30. Method: read-primary. Confidence: high.
- Verifier: confirmed in part (para 6 by verifier); outsourcing reading not separately verified.
- Sources: https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%A6%E0%A4%B2%E0%A4%BE%E0%A4%B2%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2018+_+IRDAI+%28Insurance+Brokers%29+Regulations%2C+2018.pdf/c36673a4-d5ef-2651-ff7e-917c3bae12ca?version=1.1&t=1687411185151&download=true

**REG-31** (round 2, r2-regulation-insurance). IRDAI (Maintenance of Information) Regulations 2025: intermediaries keep required records (including renewal-business records, telecaller/AV/telemarketer names and 'record of all phone numbers used for solicitation') at their principal place of business, branches or data centres located in India, for at least 10 years.
- Value: >=10 years, in India (retention). Date: 2025-01-01. Method: read-primary. Confidence: high.
- Verifier: not separately verified by the r2 verifier. **Supersedes:** SYN1-08.
- Sources: https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%E0%A4%BF%E0%A4%A4+%E0%A4%B8%E0%A4%82%E0%A4%B8%E0%A5%8D%E0%A4%A5%E0%A4%BE%E0%A4%93%E0%A4%82+%E0%A4%95%E0%A5%87+%E0%A4%A6%E0%A5%8D%E0%A4%B5%E0%A4%BE%E0%A4%B0%E0%A4%BE+%E0%A4%B8%E0%A5%82%E0%A4%9A%E0%A4%A8%E0%A4%BE+%E0%A4%95%E0%A4%BE+%E0%A4%85%E0%A4%A8%E0%A5%81%E0%A4%B0%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%A3+%E0%A4%A4%E0%A4%A5%E0%A4%BE+%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%BE%E0%A4%A7%E0%A4%BF%E0%A4%95%E0%A4%B0%E0%A4%A3+%E0%A4%95%E0%A5%87+%E0%A4%A6%E0%A5%8D%E0%A4%B5%E0%A4%BE%E0%A4%B0%E0%A4%BE+%E0%A4%B8%E0%A5%82%E0%A4%9A%E0%A4%A8%E0%A4%BE+%E0%A4%95%E0%A5%80+%E0%A4%B8%E0%A4%BE%E0%A4%9D%E0%A5%87%E0%A4%A6%E0%A4%BE%E0%A4%B0%E0%A5%80%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2025+_+IRDAI+%28Maintenance+of+Information+by+the+Regulated+Entities+and+Sharing+of+Information+by+the+Authority%29%2C+Regulations+2025.pdf/1e4ffda7-5f81-e087-ceb5-ae3c6ab0f186?version=1.1&t=1737024827159&download=true; https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%85%E0%A4%AD%E0%A4%BF%E0%A4%B2%E0%A5%87%E0%A4%96%E0%A5%8B%E0%A4%82+%E0%A4%95%E0%A4%BE+%E0%A4%85%E0%A4%A8%E0%A5%81%E0%A4%B0%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%A3%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2015+_+IRDAI+%28Maintenance+of+Insurance+Records%29+Regulations%2C+2015.pdf/4edfd2d8-7e40-13cc-70b6-7054c4eba5cb?version=1.1&t=1687411371507&download=true

**REG-32** (round 2, r2-regulation-insurance). IRDAI cyber-security guidelines 2023 apply to all intermediaries; ICT logs kept 180 days within Indian jurisdiction; no general policyholder-data localisation clause found; the 2026 guidelines' annexure was not retrieved.
- Value: 180-day logs in India (retention). Date: 2023-04-24. Method: read-primary. Confidence: medium.
- Verifier: not verified (annexure gap).
- Sources: https://irdai.gov.in/documents/37343/366029/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%E0%A4%B8%E0%A5%82%E0%A4%9A%E0%A4%A8%E0%A4%BE+%E0%A4%94%E0%A4%B0+%E0%A4%B8%E0%A4%BE%E0%A4%87%E0%A4%AC%E0%A4%B0+%E0%A4%B8%E0%A5%81%E0%A4%B0%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BE+%E0%A4%A6%E0%A4%BF%E0%A4%B6%E0%A4%BE%E0%A4%A8%E0%A4%BF%E0%A4%B0%E0%A5%8D%E0%A4%A6%E0%A5%87%E0%A4%B6+2023+_+IRDAI+Information+and+Cyber+Security+Guidelines%2C+2023.pdf/81730785-1f51-977b-5a92-d9cfd7eb2cd6?version=2.0&t=1740997153060&download=true; https://irdai.gov.in/documents/37343/366029/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%E0%A4%B8%E0%A5%82%E0%A4%9A%E0%A4%A8%E0%A4%BE+%E0%A4%94%E0%A4%B0+%E0%A4%B8%E0%A4%BE%E0%A4%87%E0%A4%AC%E0%A4%B0+%E0%A4%B8%E0%A5%81%E0%A4%B0%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BE+%E0%A4%A6%E0%A4%BF%E0%A4%B6%E0%A4%BE%E0%A4%A8%E0%A4%BF%E0%A4%B0%E0%A5%8D%E0%A4%A6%E0%A5%87%E0%A4%B6%2C+2026+_+IRDAI+Information+and+Cybersecurity+Guidelines%2C+2026.pdf/9714979d-6006-3809-297f-91a4593ac072?version=2.0&t=1777011998536&download=true

**REG-33** (round 2, r2-regulation-insurance). Commission is set by each insurer's board-approved policy within overall expense-of-management caps (30% of GWP general, 35% standalone health); product-wise caps were removed in 2023; new structures do not apply to policies already sold.
- Value: board policy within EoM caps (rule). Date: 2024-01-22. Method: read-primary. Confidence: high.
- Verifier: not separately verified.
- Sources: https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%95%E0%A4%AE%E0%A5%80%E0%A4%B6%E0%A4%A8+%E0%A4%B8%E0%A4%B9%E0%A4%BF%E0%A4%A4%2C+%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE%E0%A4%95%E0%A4%B0%E0%A5%8D%E0%A4%A4%E0%A4%BE%E0%A4%93%E0%A4%82+%E0%A4%95%E0%A5%87+%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%AC%E0%A4%82%E0%A4%A7%E0%A4%A8-%E0%A4%B5%E0%A5%8D%E0%A4%AF%E0%A4%AF%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2024+_+IRDAI+%28EOM+including+Commission%29+Regulations%2C2024.pdf/9af08911-7e26-a6c3-8b29-9d4a95968301?version=1.0&t=1706101332744&download=true; https://irdai.gov.in/documents/37343/366405/%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4%E0%A5%80%E0%A4%AF+%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%BE%E0%A4%AE%E0%A4%95+%E0%A4%94%E0%A4%B0+%E0%A4%B5%E0%A4%BF%E0%A4%95%E0%A4%BE%E0%A4%B8+%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%BE%E0%A4%A7%E0%A4%BF%E0%A4%95%E0%A4%B0%E0%A4%A3+%28%E0%A4%95%E0%A4%AE%E0%A5%80%E0%A4%B6%E0%A4%A8+%E0%A4%95%E0%A4%BE+%E0%A4%AD%E0%A5%81%E0%A4%97%E0%A4%A4%E0%A4%BE%E0%A4%A8%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2023+_+Insurance+Regulatory+and+Development+Authority+of+India+%28Payment+of+Commission%29+Regulations%2C+2023.pdf/d5312011-1c93-65aa-9a8d-03c01fd97800?version=1.1&t=1682926765873&download=true; https://irdai.gov.in/documents/37343/365525/%E0%A4%95%E0%A4%AE%E0%A5%80%E0%A4%B6%E0%A4%A8+%E0%A4%B8%E0%A4%B9%E0%A4%BF%E0%A4%A4%2C+%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE%E0%A4%95%E0%A4%B0%E0%A5%8D%E0%A4%A4%E0%A4%BE%E0%A4%93%E0%A4%82+%E0%A4%95%E0%A5%87+%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%AC%E0%A4%82%E0%A4%A7%E0%A4%A8-%E0%A4%B5%E0%A5%8D%E0%A4%AF%E0%A4%AF%2C+2024+%E0%A4%AA%E0%A4%B0+%E0%A4%AE%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%9F%E0%A4%B0+%E0%A4%AA%E0%A4%B0%E0%A4%BF%E0%A4%AA%E0%A4%A4%E0%A5%8D%E0%A4%B0+_+Master+Circular+on+Expenses+of+Management%2C+including+Commission%2C+of+Insurers%2C+2024.pdf/8b5f9495-837e-bd67-60f2-68e2be57b0b1?version=3.0&t=1716209830485&download=true

**REG-34** (round 2, r2-regulation-insurance). No rule found that entitles the intermediary of record to commission when the customer renews directly with the insurer; renewal commission on orphan policies follows board policy.
- Value: no entitlement found (finding). Date: 2024-06-19. Method: read-primary (bounded negative; scanned circular). Confidence: medium.
- Verifier: not verified.
- Sources: https://irdai.gov.in/documents/37343/365525/%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE%E0%A4%95%E0%A4%B0%E0%A5%8D%E0%A4%A4%E0%A4%BE%E0%A4%93%E0%A4%82+%E0%A4%95%E0%A5%87+%E0%A4%AA%E0%A4%B0%E0%A4%BF%E0%A4%9A%E0%A4%BE%E0%A4%B2%E0%A4%A8%E0%A5%8B%E0%A4%82+%E0%A4%94%E0%A4%B0+%E0%A4%B8%E0%A4%82%E0%A4%AC%E0%A4%A6%E0%A5%8D%E0%A4%A7+%E0%A4%B5%E0%A4%BF%E0%A4%B7%E0%A4%AF%E0%A5%8B%E0%A4%82+%E0%A4%B8%E0%A4%82%E0%A4%AC%E0%A4%82%E0%A4%A7%E0%A5%80+%E0%A4%AE%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%9F%E0%A4%B0+%E0%A4%AA%E0%A4%B0%E0%A4%BF%E0%A4%AA%E0%A4%A4%E0%A5%8D%E0%A4%B0+_+Master+Circular+on+Operations+and+Allied+Matters+of+Insurers.pdf/c4054914-a999-6bff-630e-2b4bc201f857?version=2.0&t=1723108314217&download=true; https://irdai.gov.in/documents/37343/366405/%E0%A4%86%E0%A4%88%E0%A4%86%E0%A4%B0%E0%A4%A1%E0%A5%80%E0%A4%8F%E0%A4%86%E0%A4%88+%28%E0%A4%95%E0%A4%AE%E0%A5%80%E0%A4%B6%E0%A4%A8+%E0%A4%B8%E0%A4%B9%E0%A4%BF%E0%A4%A4%2C+%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE%E0%A4%95%E0%A4%B0%E0%A5%8D%E0%A4%A4%E0%A4%BE%E0%A4%93%E0%A4%82+%E0%A4%95%E0%A5%87+%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%AC%E0%A4%82%E0%A4%A7%E0%A4%A8-%E0%A4%B5%E0%A5%8D%E0%A4%AF%E0%A4%AF%29+%E0%A4%B5%E0%A4%BF%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%AE%2C+2024+_+IRDAI+%28EOM+including+Commission%29+Regulations%2C2024.pdf/9af08911-7e26-a6c3-8b29-9d4a95968301?version=1.0&t=1706101332744&download=true

**REG-35** (round 2, r2-regulation-insurance). A neutral renewal reminder is a TRAI service call: Third Amendment (bh)(i) covers information 'pertaining to a product or service procured by such customer'; the broader 2025 (bh)(i) applies until the amendment commences; a re-quote offering a different plan, insurer or discount is promotional.
- Value: service call (classification). Date: 2026-09-18. Method: read-primary + interpretation. Confidence: high.
- Verifier: confirmed (commencement caveat).
- Sources: https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf; https://www.trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf; https://trai.gov.in/sites/default/files/2026-07/PR_No91of2026.pdf

**REG-36** (round 2, r2-regulation-insurance). Strict reading of commencement dates: 7-day inquiry window from 2026-10-19 and A2P declaration from 2026-11-18 (Gazette date unconfirmed; egazette TLS-blocked).
- Value: 2026-10-19 / 2026-11-18 (dates). Date: 2026-10-17. Method: computed from read-primary. Confidence: medium.
- Verifier: confirmed (verifier: earliest ~2026-10-18 if Gazette 2026-09-18). **Supersedes:** REG-07; REG-09 (dates).
- Sources: https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf; https://egazette.gov.in/

**REG-37** (round 2, r2-regulation-insurance). Azure Communication Services: phone-number capabilities are disabled for ACS resources created after the 2026-09-23 announcement; tenants without numbers before 2026-10-23 cannot buy them; India was never among the 44 eligible countries.
- Value: no action needed (decision input). Date: 2026-10-08. Method: read-primary; n = 44. Confidence: high.
- Verifier: confirmed. **Supersedes:** SYN1-07.
- Sources: https://learn.microsoft.com/en-us/azure/communication-services/acs-retirement-and-breaking-changes-guide; https://learn.microsoft.com/en-us/azure/communication-services/concepts/numbers/sub-eligibility-number-capability

**REG-38** (round 2, r2-regulation-insurance). Intermediaries must apply for a fresh perpetual CoR before 2027-01-31 (late to 2027-03-31); policies must be tagged to the functional identity of the SP/BQP/ISP/PoSP/AV from 2027-01-01.
- Value: 2027-01-31 / 2027-01-01 (dates). Date: 2026-07-30. Method: read-primary. Confidence: high.
- Verifier: confirmed (verifier read amendment items).
- Sources: https://irdai.gov.in/documents/37343/366405/IRDAI+%28Insurance+Intermediaries%29+%28Amendment%29+Regulations%2C+2026.pdf/4961106d-b7f4-c117-a302-4bf3ef9356c5?version=1.0&t=1785736027526&download=true; https://irdai.gov.in/documents/37343/365525/%E0%A4%B5%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%B7%E0%A4%BF%E0%A4%95+%E0%A4%B6%E0%A5%81%E0%A4%B2%E0%A5%8D%E0%A4%95+%E0%A4%95%E0%A5%87+%E0%A4%AD%E0%A5%81%E0%A4%97%E0%A4%A4%E0%A4%BE%E0%A4%A8+%E0%A4%94%E0%A4%B0+%E0%A4%AA%E0%A4%82%E0%A4%9C%E0%A5%80%E0%A4%95%E0%A4%B0%E0%A4%A3+%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%AE%E0%A4%BE%E0%A4%A3%E0%A4%AA%E0%A4%A4%E0%A5%8D%E0%A4%B0+%E0%A4%95%E0%A5%87+%E0%A4%A8%E0%A4%BF%E0%A4%B0%E0%A5%8D%E0%A4%97%E0%A4%AE+%E0%A4%95%E0%A5%87+%E0%A4%B2%E0%A4%BF%E0%A4%8F+%E0%A4%AA%E0%A4%B0%E0%A4%BF%E0%A4%B5%E0%A4%B0%E0%A5%8D%E0%A4%A4%E0%A5%80+%E0%A4%B5%E0%A5%8D%E0%A4%AF%E0%A4%B5%E0%A4%B8%E0%A5%8D%E0%A4%A5%E0%A4%BE%E0%A4%8F%E0%A4%81+%28%E0%A4%AE%E0%A4%A7%E0%A5%8D%E0%A4%AF%E0%A4%B5%E0%A4%B0%E0%A5%8D%E0%A4%A4%E0%A4%BF%E0%A4%AF%E0%A5%8B%E0%A4%82%29+_+Transitional+arrangements+for+payment+of+Annual+Fee+and+issuance++of++Certificate++of++Registration+%28Intermediaries%29.pdf/840b8111-53f2-566b-e1ce-e2d5a6b961aa?version=2.0&t=1774597157001&download=true

**REG-39** (round 2, r2-regulation-insurance). TRAI PR 91/2026: 1600 is for service and transaction calls by RBI/SEBI/IRDAI/PFRDA entities 'to their existing customers'; tagging, blocking or filtering of 1600 calls is not permitted.
- Value: 1600 = existing customers (rule). Date: 2026-07-10. Method: read-primary. Confidence: high.
- Verifier: confirmed.
- Sources: https://trai.gov.in/sites/default/files/2026-07/PR_No91of2026.pdf

## TRAI stakeholder record, 1600 and CNAP, fraud, tenders, voice of customer

**RAW-01** (round 2, r2-untouched-raw). TRAI's final Third Amendment rejected every stakeholder request to carve out AI or human-assisted calls: all AI calls are A2P and must be pre-declared, with their CLI ranges, on every number series.
- Value: no AI carve-out (ruling). Date: 2026-09-18. Method: read-primary; n = 32. Confidence: high.
- Verifier: not verified (package had no verifier).
- Sources: research-raw/l1-regulation/trai_3rd_amend_18092026.pdf (l1 S03); https://www.trai.gov.in/consultation-draft-telecom-commercial-communications-customer-preference-third-amendment

**RAW-02** (round 2, r2-untouched-raw). The INR 0.05/min A2P termination charge is under review; telcos asked for INR 0.50/min plus INR 0.05 per attempt.
- Value: 0.05 (asked 0.50 + 0.05/attempt) (INR per minute). Date: 2026-04. Method: read-primary (stakeholder submissions). Confidence: medium.
- Verifier: not verified.
- Sources: https://www.trai.gov.in/consultation-draft-telecom-commercial-communications-customer-preference-third-amendment; research-raw/l1-regulation/trai_3rd_amend_18092026.pdf (l1 S03)

**RAW-03** (round 2, r2-untouched-raw). 1600 numbers carry protections: operators may not flag them as spam (reg 21A proviso) and caller-ID apps may not tag them (reg 34A); Truecaller removed user spam tags from all 140xx and 1600xx numbers after TRAI's letter of 2025-09-12.
- Value: not flaggable / not taggable (rule). Date: 2026-09-18. Method: read-primary. Confidence: high.
- Verifier: not verified.
- Sources: research-raw/l1-regulation/trai_3rd_amend_18092026.pdf (l1 S03); https://www.trai.gov.in/consultation-draft-telecom-commercial-communications-customer-preference-third-amendment

**RAW-04** (round 2, r2-untouched-raw). TRAI stated that small BFSI players may later be exempted from mandatory 1600 under the sender-class proviso; no direction has been issued.
- Value: possible future exemption (finding). Date: 2026-09-18. Method: read-primary. Confidence: medium.
- Verifier: not verified.
- Sources: research-raw/l1-regulation/trai_3rd_amend_18092026.pdf (l1 S03)

**RAW-05** (round 2, r2-untouched-raw). LIC's 2025 RFP buys agentic voice AI for 'customer servicing, renewal reminders, lead engagement, and grievance acknowledgment', priced per minute with per-second pulse (~24 lakh minutes a year for bid comparison); self-hosted in India; open-source or indigenous models only; GPT-4/4o, Claude, Gemini and foreign-hosted APIs barred.
- Value: ~24,00,000 (minutes per year). Date: 2025-11-04. Method: read-primary. Confidence: high.
- Verifier: not verified.
- Sources: https://licindia.in/documents/20121/1599866/RFP-Procurement+of+Agentic+AI+and+GenAI+Platforms.pdf/c2255c2a-5000-ed24-cc28-292f86d55710?t=1762282446814; https://licindia.in/documents/20121/1599866/Agentic+AI+and+GEN+AI+RFP+-+Response+to+Pre-Bid+Queries.pdf/eaf549fe-837c-5e8f-7060-da08e8ebe769?t=1763096064536

**RAW-06** (round 2, r2-untouched-raw). Rajasthan Gramin Bank tender for 2,500 1600-series numbers (SIP trunk), extendable to 5,000, for outbound calling over 5 years; split L1/L2 60:40 between telcos.
- Value: 2,500 numbers (numbers). Date: 2026-06-06. Method: read-primary. Confidence: high.
- Verifier: not verified.
- Sources: https://www.rgb.bank.in/Documents/Tender/20260606_053004am.pdf

**RAW-07** (round 2, r2-untouched-raw). GeM call-centre per-seat buyer estimates (not awards): about INR 46,300-47,320 per seat-month (Gujarat 240 seats; FSSAI 24 seats), INR 36,660 per seat-shift-month (Powergrid).
- Value: 36,660-47,320 (INR per seat-month). Date: 2026-08-21. Method: read-primary + computed; n = 3. Confidence: medium.
- Verifier: not verified.
- Sources: https://fssai.gov.in/upload/uploadfiles/files/GeM-Bidding-%20Published.pdf; https://apps.powergrid.in/pgciltenders/Files/0e00026a-6e16-41ca-bfae-cabd84e2a387/GeM-Bidding.pdf; https://gil.gujarat.gov.in/tendercms/TenderDocs/20268211811987.pdf

**RAW-08** (round 2, r2-untouched-raw). CNAP caller-name display w.e.f. 2026-11-01 on 4G-and-above wireless networks only (2G/3G and PSTN later); a personal SIM shows the subscriber's KYC name; bulk/business connections may show a verified preferred name (trademark or GST trade name); SIP/PRI 1600 display not stated.
- Value: 2026-11-01 (date). Date: 2026-10-13. Method: read-primary. Confidence: high.
- Verifier: not verified. **Supersedes:** l1 S35 (secondary, 'about 2026-11-01').
- Sources: https://www.dot.gov.in/static/uploads/2026/10/d86da4092d50f052becd6113de83d37e.pdf; https://www.dot.gov.in/static/uploads/2026/03/455cd2a9081b7ec15886e2a2c48f79f7.pdf; https://trai.gov.in/sites/default/files/2025-10/Response_CNAP_28102025.pdf

**RAW-09** (round 2, r2-untouched-raw). Navi Mumbai police raided a fake vehicle-insurance renewal call centre: 32 telecallers, SIMs linked to 145 NCRP complaints, at least INR 14.08 lakh cheated.
- Value: 145 complaints; INR 14.08 lakh (count / INR). Date: 2026-07-19. Method: read-secondary; n = 145. Confidence: medium.
- Verifier: not verified.
- Sources: https://www.freepressjournal.in/mumbai/navi-mumbai-cyber-police-bust-fake-vehicle-insurance-call-centre-3-arrested-in-alleged-1408-lakh-fraud-linked-to-145-complaints

**RAW-10** (round 2, r2-untouched-raw). Delhi police: a fake call centre bought vehicle-owner details at INR 5 per record to target owners whose policies were nearing expiry.
- Value: 5 (INR per record). Date: 2025-11-22. Method: read-secondary. Confidence: medium.
- Verifier: not verified.
- Sources: https://www.theweek.in/wire-updates/national/2025/11/22/des32-dl-call-centre-bust.html

**RAW-11** (round 2, r2-untouched-raw). IRDAI Annual Report 2024-25: spurious calls impersonating IRDAI, Bima Bharosa and insurers 'pose a significant threat'; 2,57,790 grievances in 2024-25; no separate count of fake renewal calls.
- Value: 2,57,790 (grievances). Date: 2025. Method: read-primary. Confidence: high.
- Verifier: not verified.
- Sources: https://irdai.gov.in/annual-reports

**RAW-12** (round 2, r2-untouched-raw). Truecaller (interested party, internal data, no method): users ignored 79% of 1600-series and 81% of 140-series calls over the eight months to July 2026; 74 million manual blocks.
- Value: 79% ignored (1600) (share of calls). Date: 2026-07-08. Method: read-secondary. Confidence: low.
- Verifier: not verified.
- Sources: https://techcrunch.com/2026/07/08/truecaller-clashes-with-indias-telecom-regulator-over-anti-spam-rules/

**RAW-13** (round 2, r2-untouched-raw). No neutral measurement compares pickup of 1600 calls with calls from known 10-digit mobiles; industry assertions (IAMAI, AACSPAI, SquadStack) about lower pickup are unquantified; vendor claims of higher pickup are unmethodised.
- Value: none found (finding). Date: 2026-10-17. Method: read-primary (bounded negative). Confidence: medium.
- Verifier: not verified.
- Sources: https://www.trai.gov.in/consultation-paper-review-telecom-commercial-communications-customer-preference-regulations-2018; https://www.trai.gov.in/consultation-draft-telecom-commercial-communications-customer-preference-third-amendment; scratchpad research-raw/r2-reg-ins/vendors/*.txt

**RAW-15** (round 2, r2-untouched-raw). TRAI P2P data: 85.31% of SIMs make 10 or fewer outgoing calls a day and about 0.13% make more than 50; a renewal telecaller dialling 80-150 due-list calls a day from a personal SIM sits in the slice UCC_Detect flags, while 1600 CLIs are exempt.
- Value: 0.13% (share of SIMs >50 calls/day). Date: 2024-08-28. Method: read-primary + computed (inference). Confidence: medium.
- Verifier: not verified.
- Sources: https://www.trai.gov.in/sites/default/files/2024-10/CP_28082024.pdf

**RAW-16** (round 2, r2-untouched-raw). Airtel spam data: genuine calls average 57 s vs 35 s for spam; 25% of genuine calls last under 10 s vs 43% of spam calls; spam numbers average 1,400 calls a day vs 40.
- Value: 25% vs 43% under 10 s (share of calls). Date: 2026-04. Method: read-primary (operator claim). Confidence: medium.
- Verifier: not verified.
- Sources: https://www.trai.gov.in/sites/default/files/2026-04/Airtels%20Response%20to%20Draft%20TCCCP%20%283rd%20Amendment%29%20Regulations%2C%202026.pdf

**RAW-17** (round 2, r2-untouched-raw). Voice of customer for Indian telephony and voice-AI vendors: 459 complaints coded from 877 items (Play, Trustpilot, Reddit, Capterra); SUPPORT 114, BILLING 107, ACCOUNT/UI 99, RELIABILITY 71, TELEPHONY 36; ASR, TTS, turn-taking, language and latency 1-5 each; Indian voice-AI vendors have almost no public review footprint.
- Value: 459 coded / 877 items (complaints). Date: 2026-10-17. Method: computed (hand-coded taxonomy); n = 459. Confidence: medium.
- Verifier: not verified.
- Sources: lanes/r2-untouched-raw/voc-indian-vendor-counts.csv; see data/raw/voc/reddit-threads/*.json and reddit_search*.json; https://www.trustpilot.com/review/<domain>; https://play.google.com/store/apps/details?id=<app>; https://www.capterra.in/software/134642/exotel

## Cost of the stack and market prices

**ECO-01** (round 1, l2 / r2-model-corrections). Managed Azure COGS at 100k connected min/month (scenario A), Monte Carlo p50; the INR 4.53 base sits below the MC p10.
- Value: 5.88 (p10-p90 5.00-6.96) (INR per connected minute). Date: 2026-10-17. Method: computed; n = 20000. Confidence: high.
- Verifier: weakened in round 1 (4.53 -> 5.88); reproduced in round 2. **Supersedes:** l2 lane headline INR 4.53.
- Sources: lanes/l2-economics/cost-model.json; https://prices.azure.com/api/retail/prices

**ECO-02** (round 1, l2). Managed optimised stack at 1M min/month (scenario B), round-1 figures.
- Value: base 2.39; MC p50 3.06 (INR per connected minute). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: superseded in round 2 (ECO-03).
- Sources: lanes/l2-economics/cost-model.round1.json

**ECO-03** (round 2, r2-model-corrections). Scenario B at 1M min/month with NVAIE, volume-stepped commitment tiers and gpt-6-sol as speaking model; MC p50 is the headline.
- Value: 3.23 (p10-p90 2.84-3.70); base 2.57 (INR per connected minute). Date: 2026-10-17. Method: computed; n = 20000. Confidence: high.
- Verifier: reproduced (round-1 scripts re-run byte for byte first). **Supersedes:** ECO-02.
- Sources: lanes/l2-economics/cost-model.json; lanes/l2-economics/data/azure-retail-prices-2026-10-17.csv; lanes/CORRECTIONS-round2.md

**ECO-04** (round 2, r2-model-corrections). The managed stack never reaches INR 2/min: base 2.45 at 3M, 2.35 at 10M, 2.31 at 50M min/month; MC P(<=INR 2) = 0.001 at 10M with S1 STT on the 100K-hour tier.
- Value: never (INR per connected minute). Date: 2026-10-17. Method: computed. Confidence: high.
- Verifier: consistent with l2 verifier (floor 2.1-2.3, P~0.01). **Supersedes:** l2v 'floor INR 2.1-2.3'.
- Sources: lanes/l2-economics/cost-model.json

**ECO-05** (round 2, r2-model-corrections). Only robust path to <= INR 2: D-lite (gpt-6-luna plus self-hosted ASR/TTS).
- Value: MC p50 1.19 (1.07-1.33) from ~1.58M min/month (INR per connected minute). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: reproduced; quality of luna and self-hosted speech unmeasured. **Supersedes:** SYNTHESIS r1 'D-lite 1.16 from ~1.5M'.
- Sources: lanes/l2-economics/cost-model.json

**ECO-06** (round 2, r2-model-corrections). Hybrid path C (self-hosted ASR on T4) with NVAIE and corrected tiers.
- Value: MC p50 2.65; P(<=2) 0.00; base reaches 2 only at 2.10M min/month (INR per connected minute). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: reproduced. **Supersedes:** r1 path (b): 2.39, P 0.05, 0.91M.
- Sources: lanes/l2-economics/cost-model.json

**ECO-07** (round 2, r2-model-corrections). Self-hosted path D (ASR+TTS on H100, 3-year RI).
- Value: MC p50 2.25; P(<=2) 0.15; base 2 at 3.74M min/month (4.64M on 1-year RI, 5.92M on demand) (INR per connected minute). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: reproduced. **Supersedes:** r1 path (c): 2.09, P 0.36, 2.95M.
- Sources: lanes/l2-economics/cost-model.json

**ECO-08** (round 2, r2-model-corrections). B-luna (gpt-6-luna speaking model) at 1M min/month.
- Value: MC p50 2.15; P(<=2) 0.23; base 2 at 0.24M (INR per connected minute). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: reproduced. **Supersedes:** r1 path (a): 2.12, P 0.29, 0.20M.
- Sources: lanes/l2-economics/cost-model.json

**ECO-09** (round 1, l2v / r2-model-corrections). Self-hosting production use needs NVIDIA AI Enterprise licences (USD 4,500 per GPU-year) and about USD 565k of 3-year GPU commitments for path D.
- Value: 4,500 USD/GPU-yr; ~565k USD (USD). Date: 2026-10-17. Method: read-primary (vendor) + computed. Confidence: medium.
- Verifier: added by l2 verifier; applied in round 2.
- Sources: https://docs.nvidia.com/deeplearning/riva/user-guide/docs/asr/asr-performance.html; https://developer.nvidia.com/nim; lanes/l2-economics/verify.md

**ECO-10** (round 2, r2-model-corrections). Gross margin at scale (1M min/month aggregate) at a INR 6-8 yield per AI minute, with corrected scale COGS.
- Value: ~46-60% (gross margin). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: computed; superseded as a pricing basis by REN-06. **Supersedes:** SYN1-06.
- Sources: lanes/CORRECTIONS-round2.md

**ECO-11** (round 1, l8 / r2-model-corrections). AI-only cost per connected minute on our own benchmarked stacks at list price and FX 95 (streaming STT INR 1.58 = 58-82% of it).
- Value: 1.94-2.74 (INR per minute). Date: 2026-10-17. Method: computed. Confidence: high.
- Verifier: weakened in round 1 (FX 88 -> 95); applied to files in round 2. **Supersedes:** l8 lane INR 1.80-2.54 at FX 88.
- Sources: lanes/l8-azure-bench/cost-inputs.json; https://prices.azure.com/api/retail/prices

**ECO-12** (round 2, r2-latency-india). AI-only cost of the India-resident cascade (config A) at 3-5 turns a minute, list price; STT is about two thirds.
- Value: 2.29-2.76 (STT 1.58) (INR per minute). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: not separately verified.
- Sources: lanes/l8-azure-bench/round2/results/cascade_main_cost_per_min.csv

**ECO-13** (round 1, l2v). In-house telecaller cost per productive connected minute (lane said INR 8.86; ~6.3 at 200 talk-min/day).
- Value: 6-9 (INR per connected minute). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: weakened (8.86 is high-side). **Supersedes:** l2 lane INR 8.86.
- Sources: lanes/l2-economics/cost-model.json; lanes/l2-economics/verify.md

**ECO-14** (round 1, l2). Median posted telecaller pay on Apna.
- Value: 17,000 (INR per month). Date: 2026-10-17. Method: measured (crawl); n = 1234. Confidence: high.
- Verifier: confirmed.
- Sources: https://apna.co/jobs/telecaller-jobs-in-mumbai; lanes/l2-economics/data/apna-telecaller-jobs.jsonl

**ECO-15** (round 1, l4a / l4av / l2v). Indian all-in list prices for voice AI with telephony (Sarvam 3.55-3.90 with its telephony on 60-s pulse excl GST; Ringg ~6; Bolna ~6-7 with telephony and platform fee); other Indian vendors post 8-18.
- Value: 3.5-7 (others 8-18) (INR per connected minute). Date: 2026-10-17. Method: read-primary. Confidence: high.
- Verifier: weakened (lane said 3.4-6). **Supersedes:** l4a lane 'INR 3.4-6'.
- Sources: https://www.sarvam.ai/products/voice-agents/pricing; https://www.ringg.ai/pricing; https://www.bolna.ai/pricing; https://www.ravan.ai/pricing; https://smallest.ai/pricing

**ECO-16** (round 1, l2v). Effective competitor prices at volume may be INR 2-2.5/min.
- Value: 2-2.5 (INR per minute). Date: 2026. Method: read-secondary. Confidence: low.
- Verifier: unverified (secondary, untraceable).
- Sources: https://indiafintech.substack.com/p/the-hundred-buyer-problem-the-complete

**ECO-17** (round 1, l4av). US platforms over Twilio India at INR 88/USD (Vapi + Twilio).
- Value: 11.6-17.5 (INR per minute). Date: 2026-10-17. Method: computed from read-primary. Confidence: medium.
- Verifier: weakened (lane said 8-17).
- Sources: https://vapi.ai/pricing; https://www.retellai.com/pricing

**ECO-18** (round 1, l7). Managed quality-bar AI stack cost history: USD 0.579/min (2023-04) to 0.033 (2026-10); 1.7x fall in 24 months; flat 0.033-0.039 since 2025-09.
- Value: 1.7x in 24 months (ratio). Date: 2026-10-17. Method: computed from read-primary (live meters + archived pages). Confidence: high.
- Verifier: confirmed.
- Sources: lanes/l7-tech-frontier/prices.csv; https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/; https://prices.azure.com/api/retail/prices

**ECO-19** (round 2, r2-model-corrections). Managed-stack forecast end-2027, LLM prices flat (current regime): new headline.
- Value: P50 2.98 (P10-P90 2.63-3.14); end-2028 2.81 (INR per minute). Date: 2026-10-17. Method: computed (forecast). Confidence: medium.
- Verifier: published beside the cut process in round 2. **Supersedes:** l7 headline P50 INR 1.89 (cut process, optimistic) and SYNTHESIS r1 'INR 2.7-3.0'.
- Sources: lanes/l7-tech-frontier/fit-results.json

**ECO-20** (round 1, l7). Managed-stack forecast end-2027 under the cut process (assumes 2024-25 LLM cuts resume and no rises): the optimistic case.
- Value: P50 1.89 (1.41-2.84) (INR per minute). Date: 2026-10-17. Method: computed (forecast). Confidence: low.
- Verifier: weakened (l7 verifier: optimistic).
- Sources: lanes/l7-tech-frontier/fit-results.json

**ECO-21** (round 2, r2-model-corrections). GPT-5.2 was the first price rise in the frontier series: USD 1.75/14 per 1M tokens vs 1.25/10 for GPT-5.1 (+40%); per reference minute USD 0.012 -> 0.017 before GPT-5.4's 0.022.
- Value: +40% (price change). Date: 2025-12-01. Method: read-primary. Confidence: high.
- Verifier: added in round 2 (l7 verifier finding).
- Sources: https://prices.azure.com/api/retail/prices; lanes/l7-tech-frontier/prices.csv

**ECO-22** (round 1, l7v / r2-model-corrections). Plivo India carriage at 30-s pulse: INR 0.38/min live vs 0.48 in the 2024-02 capture (a 21% fall like for like); Tata INR 0.22.
- Value: 0.38 (was 0.48) (INR per minute). Date: 2026-10-17. Method: read-primary (live + archived). Confidence: high.
- Verifier: weakened in round 1 (trend mis-stated); corrected in files.
- Sources: https://www.plivo.com/voice/pricing/in/; lanes/l7-tech-frontier/prices.csv

**ECO-23** (round 1, l8v / r2-model-corrections). FX used for every INR conversion.
- Value: 94.96 (ECB 2026-10-16); 95.11 (open.er-api 2026-10-17) (INR per USD). Date: 2026-10-17. Method: read-primary. Confidence: high.
- Verifier: confirmed. **Supersedes:** FX 88 in l8 files.
- Sources: lanes/l8-azure-bench/cost-inputs.json

**ECO-24** (round 1, l8v / r2-model-corrections). MAI-Transcribe-2 list price (promotion to 2026-12-31 per pricing page; batch or Voice Live only, so not the streaming ear).
- Value: 0.10 (USD per audio hour). Date: 2026-10-17. Method: read-primary. Confidence: medium.
- Verifier: price confirmed by calculator API; end date from l8v read only.
- Sources: https://azure.microsoft.com/api/v2/pricing/cognitive-services/calculator/?culture=en-us&discount=mca

## Per-renewal economics and insurance pain

**REN-01** (round 2, r2-economics-renewal). Value to the intermediary of one incremental saved renewal (this year's commission), p50 [p10-p90]: 2W 265 [162-413]; 4W 2,415 [1,440-3,881]; health 2,737 [1,865-3,848]; life years 2+ 1,941 [1,170-3,125].
- Value: 265 / 2,415 / 2,737 / 1,941 (INR per saved renewal). Date: 2026-10-17. Method: computed (commission rates are assumption-anchored); n = 20000. Confidence: medium.
- Verifier: weakened (life skewed high; health ~15% lower after post-GST cuts). **Supersedes:** REN-05 basis.
- Sources: lanes/l2-economics/round2/renewal-model.json; https://irdai.gov.in (Handbook 2024-25 zip; copy downloaded by round-1 l3v to session scratchpad irdai/zip/hb2425.zip); https://irdai.gov.in/handbook-of-indian-insurance

**REN-02** (round 2, r2-economics-renewal (verifier)). Life years 2+ value per save at observed private renewal-commission rates (c ~ tri(1%, 2.5%, 5%)).
- Value: ~1,040 [570-1,820]; 3-year ~2,550 (INR per saved renewal). Date: 2026-10-17. Method: computed (verifier variant); n = 20000. Confidence: medium.
- Verifier: verifier correction. **Supersedes:** REN-01 (life).
- Sources: lanes/l2-economics/round2/verify.md; https://cafemutual.com/news/insurance/38077-who-are-the-top-pay-masters-in-first-year-renewal-and-single-premium-policies

**REN-03** (round 2, r2-economics-renewal (verifier)). Observed life renewal-commission ratios FY26: industry 3.7% (FY25 4.1%); LIC 5.1%; every private insurer 0-3.2% (HDFC Life 1.6%, ICICI Pru 2.1%, Axis Max 2.1%, SBI Life 2.5%, Tata AIA 3.2%).
- Value: private 0-3.2% (renewal commission / renewal premium). Date: 2026-06-28. Method: read-secondary (analysis of public disclosures). Confidence: medium.
- Verifier: verifier source.
- Sources: https://cafemutual.com/news/insurance/38077-who-are-the-top-pay-masters-in-first-year-renewal-and-single-premium-policies; https://cafemutual.com/news/insurance/36617-which-life-insurers-paid-the-highest-commission-on-first-year-renewal-and-single-premium-policies

**REN-04** (round 2, r2-economics-renewal (verifier)). From 2025-10-01 insurers reportedly cut distributor commissions on retail health and individual life by ~15-18% after the GST exemption removed input tax credit.
- Value: ~15-18% (commission cut). Date: 2025-10-01. Method: read-secondary (search snippets; pages 403). Confidence: low.
- Verifier: low-confidence verifier source.
- Sources: https://www.business-standard.com/finance/insurance/icici-lombard-care-health-aditya-birla-cut-commissions-post-gst-125100101265_1.html; https://www.business-standard.com/amp/finance/insurance/life-insurers-cut-agents-slice-to-give-customers-the-full-gst-pie-125100300965_1.html

**REN-05** (round 2, r2-economics-renewal). Round-1 value gate (INR 1,000-30,000 per save) mixed the intermediary's commission with the insurer's retained premium; only the commission is the intermediary's value.
- Value: gate mis-specified (finding). Date: 2026-10-17. Method: computed. Confidence: high.
- Verifier: confirmed. **Supersedes:** SYN1-02.
- Sources: lanes/l3-segments/value-gate.csv; lanes/l2-economics/round2/verify.md

**REN-06** (round 2, r2-economics-renewal). Per-minute pricing at INR 6-8 per AI minute loses money at launch in every renewal line: GM -47% to +1% against an all-in cost of ~INR 7.9-8.8 per AI minute (COGS 5.9 + VP-borne escalation 1.5-2.2 + WhatsApp 0.16-0.29 + 1600 adder 0.15); -8% to +21% if the buyer staffs escalations; -1% to +35% at 1M min/month with corrected COGS.
- Value: -47% to +1% (launch gross margin). Date: 2026-10-17. Method: computed (escalation load is an assumption); n = 20000. Confidence: medium.
- Verifier: weakened (conclusion stands; attribution corrected). **Supersedes:** SYN1-01.
- Sources: lanes/l2-economics/round2/renewal-results.csv; lanes/l2-economics/round2/verify.md

**REN-07** (round 2, r2-economics-renewal). Per renewal collected, 4W motor at INR 50: launch GM 66.5%, P(GM>=40%) 0.991; P(buyer gains vs no calling) 0.989; vs own desk 0.60 (talk method) / 0.69 (seat method); yield ~INR 23.5 per AI minute; 58% GM if only renewals after the first AI attempt are billed.
- Value: GM 66.5% (launch gross margin). Date: 2026-10-17. Method: computed; n = 20000. Confidence: medium.
- Verifier: weakened overall; 4W robust to every verifier variant.
- Sources: lanes/l2-economics/round2/renewal-pricing-grid.csv; lanes/l2-economics/round2/renewal-model.json

**REN-08** (round 2, r2-economics-renewal). Health at INR 15 per renewal collected: launch GM 45.3% (P>=40% 0.649), scale GM 62% with corrected COGS; 22% if only post-first-attempt renewals are billed (then INR 19 needed).
- Value: GM 45.3% (22% post-first-attempt) (launch gross margin). Date: 2026-10-17. Method: computed; n = 20000. Confidence: medium.
- Verifier: weakened.
- Sources: lanes/l2-economics/round2/renewal-pricing-grid.csv; lanes/l2-economics/round2/verify.md

**REN-09** (round 2, r2-economics-renewal). Life at INR 15: launch GM 33% (50% at INR 20); at observed private renewal commission P(buyer gains vs desk) falls to 0.40 and the rule picks INR 10, where GM is about -0.5% - life fails at launch like 2W.
- Value: fails at observed commission (finding). Date: 2026-10-17. Method: computed (verifier variant); n = 20000. Confidence: low-medium.
- Verifier: weakened.
- Sources: lanes/l2-economics/round2/verify.md

**REN-10** (round 2, r2-economics-renewal). 2W at INR 20: launch GM 12.7% (P>=40% 0.074); 40%-GM floor INR 29.1 vs ceiling 35.5; floor falls to INR 22 if the buyer staffs escalations.
- Value: GM 12.7% (launch gross margin). Date: 2026-10-17. Method: computed; n = 20000. Confidence: low-medium.
- Verifier: weakened (exclusion partly an artefact of the escalation assumption).
- Sources: lanes/l2-economics/round2/renewal-pricing-grid.csv; lanes/l2-economics/round2/verify.md

**REN-11** (round 2, r2-economics-renewal (verifier)). Renewals that arrive before the first AI attempt are 19-29% of billed renewals under 'per renewal collected on the AI-worked list' (4W 19%, 2W 21%, health 29%, life 29%).
- Value: 19-29% (share of billed renewals). Date: 2026-10-17. Method: computed; n = 20000. Confidence: medium.
- Verifier: verifier finding.
- Sources: lanes/l2-economics/round2/verify.md

**REN-12** (round 2, r2-economics-renewal (verifier)). The INR 15k monthly minimum is a judgement call: it exceeds modelled usage below ~935 due renewals a month (~1,150 in the trough month); for a 150-due agency it is 7x usage and 2.2x its whole commission gain.
- Value: ~935 due/month threshold (due renewals per month). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: verifier finding.
- Sources: lanes/l2-economics/round2/renewal-buyers.csv; lanes/l2-economics/round2/verify.md

**REN-13** (round 2, r2-economics-renewal). Months for a 10% holdout to detect the median modelled lift at 1,500 due a month: 2W 2.9, 4W 5.4, health 25.8, life 20.7 (mode baseline, no seasonality or clustering).
- Value: 2.9 / 5.4 / 25.8 / 20.7 (months). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: confirmed (arithmetic re-checked).
- Sources: lanes/l2-economics/round2/renewal-mde.csv

**REN-14** (round 2, r2-economics-renewal). Kill criterion 1 bridge: a 3-seat renewal desk works about 6,800 due renewals a month in 4W, health or life (~16,000 in 2W); INR 1.1-1.5 lakh a month needs 6,850-9,350 due on a mixed book (INR 16.05 per due; 3,700-16,000 depending on mix).
- Value: ~6,800 (due renewals per month). Date: 2026-10-17. Method: computed (every input an assumption); n = 20000. Confidence: medium.
- Verifier: confirmed. **Supersedes:** r1 KC1 '>=3 renewal telecallers'.
- Sources: lanes/l2-economics/round2/renewal-buyers.csv; lanes/l2-economics/round2/verify.md

**REN-15** (round 2, r2-economics-renewal). Whether AI is cheaper than the buyer's own desk depends on unmeasured desk productivity: P(AI cheaper) 0.00-0.03 under talk-minute costing, 0.15-0.94 under seat costing.
- Value: 0.00-0.94 (probability). Date: 2026-10-17. Method: computed; n = 20000. Confidence: low.
- Verifier: confirmed (correctly hedged).
- Sources: lanes/l2-economics/round2/renewal-results.csv

**REN-16** (round 2, r2-economics-renewal). IRDAI Handbook FY25: brokers hold 49.50% of motor gross direct premium (INR 49,052 of 99,093 Cr), 13.06% of individual health policies and 3.85% of individual life new business; agents 65.94% (health) and 72.59% (life).
- Value: 49.5% of motor premium (channel share). Date: 2026-02-03. Method: read-primary. Confidence: high.
- Verifier: confirmed (verifier re-read Part V).
- Sources: https://irdai.gov.in (Handbook 2024-25 zip; copy downloaded by round-1 l3v to session scratchpad irdai/zip/hb2425.zip); https://irdai.gov.in/handbook-of-indian-insurance

**REN-17** (round 2, r2-economics-renewal / r2-founder-kit). IMFs are tiny renewal books: 799 IMFs at 31-03-2025 (Handbook T98) produced 59,809 health and 33,915 life policies in FY25, about 75 health and 42 life each; the live register lists 940 IMFs, 496 with a current validity date.
- Value: ~75 health + ~42 life per IMF per year (policies). Date: 2026-10-17. Method: read-primary + computed; n = 799. Confidence: high.
- Verifier: confirmed with denominator correction (799 not 940). **Supersedes:** r2 package '64 health / 36 life per IMF'; l3 '940 IMFs' as active pool.
- Sources: https://irdai.gov.in (Handbook 2024-25 zip; copy downloaded by round-1 l3v to session scratchpad irdai/zip/hb2425.zip); https://irdai.gov.in/handbook-of-indian-insurance; https://irdai.gov.in/list-of-imfs; founder-kit/strata.csv

**REN-18** (round 2, r2-economics-renewal). Policybazaar health renewal persistency by number of policies: overall 79% (FY23) -> 87% (FY26) -> 88.9% (JFM'26); first renewal 71 -> 85 -> 86.6%; first-renewal leakage 13.4-15%.
- Value: 87-88.9% overall (renewal rate (NOP)). Date: 2026-05-11. Method: read-primary (company disclosure, unaudited). Confidence: medium-high.
- Verifier: confirmed (wording corrected).
- Sources: https://www.pbfintech.in/pdf/investor-presentation-11052026-pbfl.pdf; https://www.pbfintech.in/pdf/annual-report-fy26-pbfintech.pdf; https://www.pbfintech.in/pdf/transcript-q1fy27.pdf

**REN-19** (round 1, l3v / r2-economics-renewal). Star Health retail health renewal premium ratio (premium basis, not policy count).
- Value: 95% / 98.4% / 97% (FY23-25) (renewal ratio by premium). Date: 2025-04-29. Method: read-secondary (search snippet of filing). Confidence: medium.
- Verifier: basis confirmed.
- Sources: https://nsearchives.nseindia.com/corporate/STARHEALTH_29042025194646_PresentationQ4FY2025.pdf

**REN-20** (round 2, r2-economics-renewal). About 56% of registered vehicles are uninsured: 16.54 of 30.48 crore (MoRTH data via Lok Sabha reply; cited in the 2026 SC TP-tenure judgment).
- Value: ~56% (share of vehicles). Date: 2026-08-04. Method: read-secondary. Confidence: medium.
- Verifier: not separately verified (MoRTH/IIB blocked).
- Sources: https://www.livelaw.in/top-stories/supreme-court-directs-increase-of-third-party-insurance-of-cars-to-4-two-wheelers-to-6-years-544306; https://studycafe.in/no-proposal-for-on-spot-third-party-insurance-cover-for-motor-vehicle-by-government-205776.html

**REN-21** (round 1, l3 / l3v). Life persistency at 31-03-2025 by policy count: LIC 13th month 64.1%, 61st 50.3%; private median 77% / 50.6%; LIC 68.6 lakh lapses or forfeitures in FY25 (wrong buyer and line for the beachhead).
- Value: 64.1% / 77% (13th-month persistency). Date: 2025-03-31. Method: read-primary; n = 21. Confidence: high.
- Verifier: confirmed.
- Sources: https://irdai.gov.in/handbook-of-indian-insurance

**REN-22** (round 2, r2-economics-renewal / r2-competition-measured). Policybazaar guides ~80% contribution margin on renewal revenue (INR 935 Cr FY26); HSIE models renewal commission 6.5-7.0% and premium persistency 57-61% (FY24-28E).
- Value: ~80% margin (contribution margin). Date: 2026-06-01. Method: read-primary + read-secondary. Confidence: medium.
- Verifier: not separately verified.
- Sources: https://www.pbfintech.in/pdf/investor-presentation-11052026-pbfl.pdf; https://www.hdfcsec.com/hsl.docs/PB%20Fintech%20-%20Update%20-%20Jun26%20-%20HSIE-202606010635031047409.pdf

**REN-23** (round 2, r2-economics-renewal (verifier)). PB monthly-mode life plans rose from 11% to 34% of new life policies (FY24 to FY26), so 'per life renewal' fees are ambiguous for modal policies.
- Value: 11% -> 34% (share of new life policies). Date: 2026. Method: read-primary. Confidence: medium.
- Verifier: verifier finding.
- Sources: https://www.pbfintech.in/pdf/annual-report-fy26-pbfintech.pdf

**REN-24** (round 2, r2-competition-measured). IRDAI consultation 'Recalibrating Economics of Insurance Distribution' (23-09-2026; comments due 25-10-2026) proposes one IDE licence and IDE commission caps: individual health renewal/porting 5%; old-vehicle motor OD 10%, TP 2.5%; life renewal 3% (2% below PPT 6); PoSP pay-outs from the IDE's commission.
- Value: health renewal 5%; motor OD 10% / TP 2.5%; life 2-3% (max commission (proposal)). Date: 2026-09-23. Method: read-primary. Confidence: high (text); proposal only.
- Verifier: not verified (no verifier on this package).
- Sources: https://irdai.gov.in/web/guest/document-detail?documentId=9852848; lanes/l4b-measured/round2/irdai-distribution-consultation-excerpts.txt

**REN-25** (round 2, r2-founder-kit). Under the proposed caps the value per save falls to 0.33-0.49 of the modelled value (2W ~116, car ~1,060, health ~915, life ~955); only the car fee stays below the buyer's ceilings.
- Value: 0.33-0.49x (ratio). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: not verified.
- Sources: founder-kit/code/caps_sensitivity.py; founder-kit/interview-guide.md

**REN-26** (round 2, r2-economics-renewal). Seasonality indices and attempts per customer in the renewal model are assumptions; no monthly due-list data exists.
- Value: assumption (input). Date: 2026-10-17. Method: assumption. Confidence: low.
- Verifier: flagged by package.
- Sources: lanes/l2-economics/round2/renewal-model.json

## Segments, sizing and expansion

**SEG-01** (round 1, l3). Frozen scorecard: insurance renewals #1 at 3.85; P(top1) 0.92 over 10,000 Dirichlet weightings; the whole 0.40 lead over real estate comes from post_sales_share.
- Value: 3.85; P(top1) 0.92 (score). Date: 2026-10-17. Method: computed; n = 10000. Confidence: medium.
- Verifier: weakened.
- Sources: lanes/l3-segments/scorecard.csv; lanes/l3-segments/weights.json

**SEG-02** (round 2, r2-model-corrections). With post_sales_share = 0 (V1): insurance renewals and real estate tie at 3.722 (P(top1) 0.46 vs 0.48); edtech rises to #3; lending collections falls from #4 to #8.
- Value: tie 3.722 (score). Date: 2026-10-17. Method: computed; n = 10000. Confidence: high.
- Verifier: reproducible variant beside the frozen scorecard. **Supersedes:** SEG-01 (rank claim); SYN1-10.
- Sources: lanes/l3-segments/scorecard-variants.csv

**SEG-03** (round 1, l3v). On the pre-registered multiplicative form S1: insurance renewals #3 (D2C #1, real estate #2); lending #13.
- Value: #3 (rank). Date: 2026-10-17. Method: computed. Confidence: high.
- Verifier: confirmed.
- Sources: lanes/l3-segments/scorecard.csv

**SEG-04** (round 2, r2-model-corrections). A symmetric outcome gate removes no segment; D2C stays #3 but has the thinnest headroom (1.8 calls of managed COGS per outcome vs 17-170 for others); a per-minute gate's verdict depends on which market-price statistic is used.
- Value: all pass (gate). Date: 2026-10-17. Method: computed. Confidence: high.
- Verifier: reproducible. **Supersedes:** SYNTHESIS r1 'D2C fails a price-floor gate'.
- Sources: lanes/l3-segments/scorecard-variants.csv; lanes/l3-segments/scorecard-gate-grid.csv

**SEG-05** (round 1, l3). Real-estate triangulated pool ~INR 830 Cr/yr (legs not independent); modelled human spend p50 INR 3,769 Cr.
- Value: 830 / 3,769 (INR Cr per year). Date: 2026-10-17. Method: computed. Confidence: low-medium.
- Verifier: weakened.
- Sources: lanes/l3-segments/sizing-triangulated.csv; lanes/l3-segments/sizing.json

**SEG-06** (round 1, l3 / r2-founder-kit). Insurance intermediary registers: 874 brokers (791 direct, mostly commercial lines; 696 valid today), 689 corporate agents (mostly banks; 448 non-bank listed, 391 valid), 940 IMFs (496 valid), 23 web aggregators.
- Value: 874 / 689 / 940 / 23 (registered entities). Date: 2026-10-17. Method: read-primary + computed. Confidence: high.
- Verifier: confirmed.
- Sources: https://irdai.gov.in/list-of-brokers; https://irdai.gov.in/list-of-corporate-agents; https://irdai.gov.in/list-of-imfs; https://irdai.gov.in/list-of-web-aggregators; founder-kit/strata.csv

**SEG-07** (round 1, l3v). In-reach insurance-renewal pool (round 1).
- Value: ~76-96 (central ~83) (INR Cr per year). Date: 2026-10-17. Method: computed. Confidence: low-medium.
- Verifier: weakened (lane said 94, range 18-1,118). **Supersedes:** l3 lane INR 94 Cr.
- Sources: lanes/l3-segments/sizing.json; lanes/l3-segments/verify.md

**SEG-08** (round 1, l6 / l3v). Median modelled AI-handled calls a month per buyer: insurance 9,440, collections 18,728, real estate 6,089 (assumption-driven, probably high).
- Value: 9,440 / 18,728 / 6,089 (calls per month). Date: 2026-10-17. Method: computed (assumptions). Confidence: low.
- Verifier: weakened.
- Sources: lanes/l6-self-learning/data/power-segment-volumes.csv

**SEG-09** (round 1, l6). Share of buyers able to test a +10% relative outcome lift in month one: collections 36%, insurance 22%, real estate 3.5%, D2C 0.7%.
- Value: 36 / 22 / 3.5 / 0.7% (share of buyers). Date: 2026-10-17. Method: computed. Confidence: low-medium.
- Verifier: weakened (inputs assumption-driven).
- Sources: lanes/l6-self-learning/data/power-segment-volumes.csv

**SEG-10** (round 1, l3). Lending collections already has at least 8 AI incumbents (Saarthi, Gnani, Credgenics, DPDzero, RevRag, SquadStack, CredResolve, Exotel).
- Value: >=8 (vendors). Date: 2026-10-17. Method: read-primary (vendor pages); n = 8. Confidence: medium.
- Verifier: weakened (rank claim), vendor count not disputed.
- Sources: lanes/l3-segments/verify.md

**SEG-12** (round 2, r2-economics-renewal). Expansion sizing p50 (p10-p90), INR Cr/yr, as of 2026-10: S0 beachhead at the price card 107 (89-127), 58 excluding big platforms; S1 insurers' renewal desks ex-LIC 51 (36-72); S2 other BFSI 1600 service calls 166 (94-283); S3 non-BFSI post-sales 1,980 (751-6,163, weakest); all insurance renewal calling incl LIC 211 (154-288).
- Value: 107 / 51 / 166 / 1,980 (INR Cr per year). Date: 2026-10-17. Method: computed; n = 20000. Confidence: low-medium.
- Verifier: not verified (verifier scope did not cover sizing). **Supersedes:** SEG-07 as the beachhead pool figure.
- Sources: lanes/l2-economics/round2/expansion-sizing.csv

**SEG-13** (round 2, r2-economics-renewal). Incumbent-revenue reconciliation: implied Indian voice-agent revenue ~INR 148 Cr (132-165), about 1.5% of the l3 total SAM.
- Value: ~148 (1.54% of SAM) (INR Cr). Date: 2026-10-17. Method: computed (MCA-via-press revenue x assumed voice shares); n = 14. Confidence: low-medium.
- Verifier: not verified.
- Sources: lanes/l2-economics/round2/incumbent-reconciliation.csv; lanes/l4a-competitors/data/company-financials.csv

**SEG-14** (round 2, r2-economics-renewal). TRAI cross-check corrected: bottom-up BFSI post-sales minutes / (1600 minutes x in-reach share) p50 5.59 (1.52-22.49); either the seat model is ~3-6x high or in-reach calling runs off-series (10-digit numbers).
- Value: 5.59 (ratio). Date: 2026-10-17. Method: computed; n = 20000. Confidence: medium.
- Verifier: not verified. **Supersedes:** l3 'bottom-up reconciles with TRAI within 1.35x'.
- Sources: lanes/l2-economics/round2/trai-reconciliation.csv; https://www.trai.gov.in/sites/default/files/2026-08/PR_No111of2026.pdf

## Competition and distribution

**CMP-01** (round 1, l4a). On headline features the platforms are at parity: 10-12 of 12 document campaigns, inbound, transfer, knowledge base, tools, extraction and analytics.
- Value: 10-12 of 12 (platforms). Date: 2026-10-17. Method: read-primary (vendor docs); n = 12. Confidence: medium.
- Verifier: weakened (marketing contradicts docs on learning/memory).
- Sources: lanes/l4a-competitors/data/parity.csv

**CMP-02** (round 1, l4b). Homepage demo agents (not configured platforms), clean-turn p50 with call-clustered 90% CI, US-East vantage via proxy: Ultravox 1,540 (1,328-1,741), Vapi 2,319 (2,116-2,609), ElevenLabs 3,749 (3,482-4,038) ms.
- Value: 1,540 / 2,319 / 3,749 (ms). Date: 2026-10-17. Method: measured; n = 24. Confidence: medium.
- Verifier: weakened (CIs must be call-clustered; demos are not platforms).
- Sources: lanes/l4b-measured/data/measurements.csv; lanes/l4b-measured/round2/data/summary-by-vendor-r2.csv; https://www.ultravox.ai; https://vapi.ai; https://elevenlabs.io/conversational-ai

**CMP-03** (round 1, l4b). Vapi's homepage demo (automatic language detection) answered a Hinglish caller in Gujarati on 17/18 turns and an elderly Hindi caller in Punjabi (Gurmukhi script); ElevenLabs' demo answered Hindi callers in English.
- Value: 17/18 (turns). Date: 2026-10-17. Method: measured; n = 18. Confidence: medium.
- Verifier: weakened (core confirmed and strengthened).
- Sources: lanes/l4b-measured/data/measurements.csv

**CMP-04** (round 2, l4b / r2-competition-measured). Cut-ins at the elderly caller's mid-sentence pause (rendered ~2.4 s of silence, where many humans would also take the turn): 5/6 US-demo calls in round 1; 12 of 13 demo calls across all measured demos after round 2.
- Value: 12/13 (calls). Date: 2026-10-17. Method: measured; n = 13. Confidence: medium.
- Verifier: weakened in round 1 (pause 2.4 s not 1.6 s). **Supersedes:** SYNTHESIS r1 '5 of 6 calls at a 1.6 s pause'.
- Sources: lanes/l4b-measured/data/measurements.csv; lanes/l4b-measured/round2/data/measurements.csv

**CMP-05** (round 1, l4b). Under market babble (~15 dB SNR, Bhojpuri persona only) Ultravox looped its greeting 7 times; Vapi collided on 4 of 9 turns per call; babble is confounded with dialect at n=2 calls per vendor.
- Value: 7 loops (repeats). Date: 2026-10-17. Method: measured; n = 2. Confidence: low-medium.
- Verifier: weakened (one sub-claim refuted).
- Sources: lanes/l4b-measured/data/measurements.csv

**CMP-06** (round 2, r2-competition-measured). Sarvam's anonymous homepage widget (EMI-reminder demo persona), 8 calls: clean-turn p50 3,116 ms (90% CI by call 2,717-3,400), p90 3,835 ms, n=46 clean turns; from India likely ~0.3 s faster (estimate).
- Value: 3,116 (ms). Date: 2026-10-17. Method: measured (US-East vantage); n = 46. Confidence: medium.
- Verifier: not verified (no verifier); threshold sensitivity 2,942-3,191 ms.
- Sources: lanes/l4b-measured/round2/data/summary-by-vendor-r2.csv; https://www.sarvam.ai/products/voice-agents

**CMP-07** (round 2, r2-competition-measured). Sarvam's EMI-reminder demo agent claimed to be human in 6 of 6 calls where asked 'aap robot ho? AI ho?' (Hindi, Tamil and English).
- Value: 6/6 (calls). Date: 2026-10-17. Method: measured (vendor transcript + Azure STT, hand-coded); n = 6. Confidence: high (no human listen yet).
- Verifier: not verified; the automatic coder mis-scored it.
- Sources: lanes/l4b-measured/round2/data/sarvam-vendor-transcripts.md; lanes/l4b-measured/round2/data/manual-codes-r2.csv

**CMP-08** (round 2, r2-competition-measured). Sarvam's demo held the caller's language: Hindi/Hinglish on 38 of 40 spoken turns to Hindi personas, Tamil (Tanglish) 20/20 to the Tamil-English persona; its ASR transcribed Bhojpuri correctly.
- Value: 38/40; 20/20 (turns). Date: 2026-10-17. Method: measured; n = 60. Confidence: medium.
- Verifier: not verified.
- Sources: lanes/l4b-measured/round2/data/summary-by-vendor-r2.csv

**CMP-09** (round 2, r2-competition-measured). Sarvam's demo went silent after the greeting under babble (2/2 calls) and cut into the elderly pause (2/2).
- Value: 2/2; 2/2 (calls). Date: 2026-10-17. Method: measured; n = 2. Confidence: medium.
- Verifier: not verified.
- Sources: lanes/l4b-measured/round2/data/sarvam-vendor-transcripts.md

**CMP-10** (round 2, r2-competition-measured). Other anonymous demos measured in round 2 (English-only): Cartesia p50 1,736 ms (1,616-1,929), Smallest 2,362 (2,284-2,740; never disclosed being AI, evaded 8/8), Deepgram 2,242 (2 calls).
- Value: 1,736 / 2,362 / 2,242 (ms). Date: 2026-10-17. Method: measured; n = 18. Confidence: medium.
- Verifier: not verified.
- Sources: lanes/l4b-measured/round2/data/summary-by-vendor-r2.csv

**CMP-11** (round 2, r2-competition-measured). No homepage demo of the 7 measured met the 1.5 s clean-turn p50 bar with a call-clustered CI.
- Value: 0/7 (demos). Date: 2026-10-17. Method: measured; n = 7. Confidence: medium.
- Verifier: not verified.
- Sources: lanes/l4b-measured/round2/data/summary-by-vendor-r2.csv

**CMP-12** (round 2, r2-competition-measured). Arrowhead's anonymous demo is broken by a vendor-side CORS bug; Millis needs a port-8080 WebSocket; Ringg and Invorto demos are gated behind phone/LeadSquared forms; Sesame has bot protection; Caller.digital started nothing.
- Value: unmeasured (demos). Date: 2026-10-17. Method: measured (access probes); n = 6. Confidence: high.
- Verifier: not verified.
- Sources: lanes/l4b-measured/round2/data/gates.csv

**CMP-13** (round 2, r2-competition-measured). At least 10 Indian voice-AI offers market insurance renewal calling; Gnani (Renewal365), SquadStack and Arrowhead publish insurer renewal cases; Policybazaar is a named Ringg client (lead qualification); only a managed per-renewal service for small and mid intermediaries was not found.
- Value: >=10 offers (vendors). Date: 2026-10-17. Method: read-primary (vendor claims); n = 10. Confidence: medium.
- Verifier: not verified. **Supersedes:** SYN1-04.
- Sources: lanes/l4b-measured/round2/competition-intermediary.csv; https://www.gnani.ai/agentic-ai-for-insurance; https://www.squadstack.ai/industry/insurance; https://arrowhead.ai/use-cases/insurance; https://www.ringg.ai/industries/insurance; https://edesy.in/ai-voice-agent/solutions/insurance-renewal-india; https://caller.digital/industries/insurance

**CMP-14** (round 2, r2-competition-measured). Gnani claims '12M+ total renewals handled' and, for a top-3 general insurer, 52% (private car) and 56% (two-wheeler) lower renewal cost; SquadStack claims a leading general insurer automated 10 lakh+ leads a month and cut renewal costs 60%.
- Value: 52-60% lower cost (vendor claim). Date: 2026-10-17. Method: vendor-claim. Confidence: low.
- Verifier: not verified.
- Sources: https://www.gnani.ai/customer-stories/private-car-insurance-renewals; https://www.gnani.ai/customer-stories/two-wheeler-insurance-renewals; https://www.squadstack.ai/case-study/success-story-with-leading-general-insurer

**CMP-15** (round 2, r2-competition-measured). The '+10% renewal ratio at Universal Sompo' attributed to LeadSquared plus Invorto is a ~2018 field-sales CRM case with no voice AI; the current LSQ insurance page does not mention it.
- Value: no voice AI (finding). Date: 2026-10-17. Method: read-primary. Confidence: high.
- Verifier: not verified. **Supersedes:** SYN1-12.
- Sources: https://www.leadsquared.com/case-studies/increased-new-lead-acquistion/; https://www.leadsquared.com/crm-for-insurance/

**CMP-16** (round 2, r2-competition-measured). Self-serve voice-AI list prices for insurance renewal start around INR 4-10 per connected minute (Edesy 'from $0.04/min', Ringg USD 0.10 self-serve, MyOperator INR 5 + 8/conversation); Caller.digital insurance INR 3-8/min plus INR 1-3 lakh/month platform fee.
- Value: ~4-10 (INR per connected minute). Date: 2026-10-17. Method: read-primary (vendor pages). Confidence: medium.
- Verifier: not verified.
- Sources: lanes/l4b-measured/round2/competition-intermediary.csv; https://caller.digital/pricing; https://www.ringg.ai/pricing

**CMP-17** (round 2, r2-competition-measured). Insurers and aggregators run renewals themselves: three vendors publish insurer renewal-automation cases; TurtlemintPro sells renewal reminders to 5 lakh+ advisors; no Indian insurer-to-BPO renewal contract found in one search; RenewBuy blocked (403).
- Value: insurer-direct competition (finding). Date: 2026-10-17. Method: read-primary (vendor pages). Confidence: medium.
- Verifier: not verified.
- Sources: lanes/l4b-measured/round2/competition-intermediary.csv; https://www.turtlemintpro.com/

**CMP-18** (round 1, l4a / l4av). Enterprise floors: Sarvam Enterprise tiers span 4k-2 lakh min/month; Synthflow from USD 30k/yr; MyOperator sells a managed 'AI Team' plan to SMBs.
- Value: varies (price floor). Date: 2026-10-17. Method: read-primary. Confidence: medium.
- Verifier: weakened (mid-market gap narrower than claimed).
- Sources: https://www.sarvam.ai/products/voice-agents/pricing; https://synthflow.ai/pricing

**CMP-19** (round 1, l4c). Self-serve vs sales-led revenue per customer: Bolna ~INR 4,900/month (1,050+ paying customers, 75% self-serve) vs Ozonetel ~26-37k, Exotel <=~50k, LeadSquared ~1.7 lakh, Gnani ~2.3 lakh.
- Value: ~4.9k vs 26k-2.4L (INR per month). Date: 2026-10-17. Method: computed from read-secondary. Confidence: medium.
- Verifier: weakened ('50x' is the extreme pair; pass-through revenue).
- Sources: lanes/l4c-incumbents-distribution/data/arpa.csv; https://techcrunch.com/2026/01/20/bolna-nabs-6-3-million-from-general-catalyst-for-its-india-focused-voice-orchestration-platform/

**CMP-20** (round 1, l4c). Context field experiments: goal-specific reminders +16% saving while generic reminders did nothing (Karlan et al.); a loan officer's name helped only repeat clients (Karlan, Morten, Zinman); a two-way call raised timely repayment +34.4 pp (LATE; ATE ~16.6-20.1 pp) (Laudenbach et al., n=3,448); none tests AI voice with CRM context.
- Value: +16%; +34.4 pp LATE (effect). Date: 2025. Method: read-primary; n = 3448. Confidence: high.
- Verifier: confirmed.
- Sources: https://www.nber.org/bah/2010no3/do-reminders-increase-saving; https://www.nber.org/papers/w17952; https://www.ifo.de/DocDL/cesifo1_wp7295.pdf; lanes/l4c-incumbents-distribution/data/h8-context-evidence.csv

**CMP-21** (round 1, l4c). Indian SMBs adopt point tools first (Zoho One ~5% of 1M+ paying customers) but 24% of Zoho One buyers start on the suite; LimeChat, WATI and HubSpot now market voice.
- Value: ~5%; 24% (share). Date: 2026-10-17. Method: read-secondary. Confidence: medium.
- Verifier: weakened.
- Sources: lanes/l4c-incumbents-distribution/incumbents.csv

**CMP-22** (round 1, l4c). CPaaS and telephony vendors sell their own voice bots (Exotel, Ozonetel, Gupshup/Knowlarity, MyOperator, TTBS), so they are infrastructure and competitors, not resellers; LeadSquared's partner channel was high single-digit % of revenue (2021); Zoho Marketplace 'telephony' returns 737 results.
- Value: 737 results (listings). Date: 2026-10-17. Method: read-primary / read-secondary. Confidence: medium.
- Verifier: weakened (core holds).
- Sources: lanes/l4c-incumbents-distribution/channels.csv; https://marketplace.zoho.com/search?searchTerm=telephony; https://gtmdialogues.substack.com/p/nilesh-patel-ceo-leadsquared

**CMP-23** (round 1, l4c). BYO-bot telephony paths exist: Exotel AgentStream (WebSocket, 8 kHz PCM), ElevenLabs on Ozonetel SIP, Vobiz (70% of its business from AI-voice startups).
- Value: 3 paths (paths). Date: 2026-10-17. Method: read-secondary / vendor-claim. Confidence: medium.
- Verifier: confirmed (core).
- Sources: https://www.voicendata.com/news/exotel-launches-agentstream-to-power-ultra-low-latency-ai-voice-experiences-9655590; https://elevenlabs.io/sv/agents/integrations/ozonetel; https://inc42.com/startups/how-vobiz-ai-is-building-the-backbone-of-indias-voice-ai-boom/

**CMP-24** (round 1, l4c). Sales cycle: pilots 2-8 weeks (SquadStack FAQ 3-8; Caller.digital 2-4), production 8-12+ weeks; BFSI enterprise has 90-day commitments.
- Value: 2-8 weeks pilot; 8-12+ production (weeks). Date: 2026-10-17. Method: vendor-claim. Confidence: medium.
- Verifier: not disputed.
- Sources: lanes/l4c-incumbents-distribution/channels.csv; https://www.squadstack.ai/fully-managed-telecalling-for-sales-operations-teams

**CMP-25** (round 1, l4c). No primary data on Indian SMB CAC or churn for voice AI; only unverified consultancy estimates (CAC USD 80-250, payback 18-36 months).
- Value: none (finding). Date: 2026-10-17. Method: read-secondary (bounded negative). Confidence: medium.
- Verifier: confirmed gap.
- Sources: lanes/l4c-incumbents-distribution/verify.md

**CMP-26** (round 1, l4c / hv). Inherited outbound funnel (CarbonSettle cold email to Indian exporters, a different ICP): 8,784 sends -> 88 replies (1.0%) -> 21 positive -> 3 meetings -> 0 won.
- Value: 0 won / 8,784 (sends). Date: 2026-09-04. Method: measured (inherited); n = 8784. Confidence: high (mechanics) / low (transfer).
- Verifier: n/a.
- Sources: docs/harvest/cc-main.md; docs/harvest/cc-branches.md

**CMP-27** (round 1, l4a / l1). Self-serve platforms mostly leave DLT/PE registration, consent and NCPR scrubbing to the buyer (Sarvam: compliance 'is your responsibility'; Bolna has the buyer register on Tata's DLT portal); Exotel states 09:00-21:00 against the primary 10:00-21:00.
- Value: buyer-held compliance (finding). Date: 2026-10-17. Method: read-primary. Confidence: medium.
- Verifier: weakened ('only Sarvam mentions DND' was a scan artefact).
- Sources: https://docs.sarvam.ai/voice-agents/deploy/campaigns/dnd; https://www.bolna.ai/docs/obtaining-regulated-phone-numbers; https://developer.exotel.com/docs/faqs/calling-hours

## Latency, speech and model behaviour

**LAT-01** (round 1, l8). Round-1 latency from Ohio through a proxy: Voice Live 2.27 s / 2.63 s (gateable), azure-realtime 1.44 s (cannot be gated; answered in English on 6/16 Hinglish turns); own cascade estimated 2.2-4 s.
- Value: 2.27-2.63 s; est. 2.2-4 s (first-audio latency). Date: 2026-10-17. Method: measured / estimate; n = 30. Confidence: medium.
- Verifier: confirmed with caveats; superseded for planning by LAT-02.
- Sources: lanes/l8-azure-bench/results/voicelive_summary.csv

**LAT-02** (round 2, r2-latency-india). India-resident streaming cascade (config A: Central India STT hi-IN 500 ms segmentation, gpt-4.1-mini South India Standard with async filter, say-first clause with ~22 us code gate, Central India neural TTS), from a Central India VM: clean-turn p50 1,004 ms (CI 989-1,017), p90 1,105 ms, n=48 clean; 58/60 turns answered, all within 1.5 s.
- Value: 1,004 (p90 1,105) (ms (server-side, no telephone leg)). Date: 2026-10-17. Method: measured (synthetic Azure TTS callers; Saturday 22:36-00:01 IST); n = 60. Confidence: medium.
- Verifier: weakened (2 unanswered elderly turns; 25-27% collisions; first clause is mostly a 1-2 word acknowledgement). **Supersedes:** LAT-01; SYN1-05.
- Sources: lanes/l8-azure-bench/round2/results/cascade_main_summary.csv; lanes/l8-azure-bench/round2/results/cascade_main_turns_s1.csv

**LAT-03** (round 2, r2-latency-india). Speculative variant (config E): p50 823 ms (CI 729-865), p90 1,029; paired vs A -224 ms (CI -259 to -149); the release matcher (string similarity >= 0.85) accepted truncated transcripts on 3/58 turns and negation flips on 4/4 constructed Hindi pairs; ~2x LLM tokens (429s at ~3 sessions).
- Value: 823 (ms). Date: 2026-10-17. Method: measured; n = 58. Confidence: medium.
- Verifier: confirmed with an uncosted hazard.
- Sources: lanes/l8-azure-bench/round2/results/cascade_main_summary.csv; lanes/l8-azure-bench/round2/results/cascade_main_paired.csv

**LAT-04** (round 2, r2-latency-india). Other configs server-side: B (800 ms, no speculation) p50 1,348 / p90 1,454 (passes, ~150 ms p90 headroom); D (gpt-6-sol EU data zone) p50 1,546 (fails); F (gpt-5.4-nano SEA) p50 1,360, p90 1,631.
- Value: 1,348 / 1,546 / 1,360 (ms). Date: 2026-10-17. Method: measured; n = 60. Confidence: medium.
- Verifier: weakened (package wrongly listed B as failing).
- Sources: lanes/l8-azure-bench/round2/results/cascade_main_summary.csv

**LAT-05** (round 2, r2-latency-india). Collisions by l4b's definition on main turns: A 27%, B 18%, C 37%, D 22%, E 50%, F 23%, against kill criterion 6's <=5%; cut-ins on 0.9-1.3 s mid-turn pauses 17-100%; 0/30 on turns without a >=0.5 s pause; every config took the turn in the elderly 2.4 s pause (12/12).
- Value: 18-50% (bar <=5%) (collision rate). Date: 2026-10-17. Method: measured; n = 60. Confidence: medium.
- Verifier: confirmed (counter misses a few talk-overs).
- Sources: lanes/l8-azure-bench/round2/results/cascade_main_cutins_by_pause.csv; lanes/l8-azure-bench/round2/results/clip_pauses.csv; lanes/l8-azure-bench/round2/verify.md

**LAT-06** (round 2, r2-latency-india). A quiet elderly 'hmm' (0.45 s) was never transcribed by Azure STT in any arm, so the agent stayed silent to the 12 s deadline (2 of 60 turns unanswered).
- Value: 0/2 transcribed (turns). Date: 2026-10-17. Method: measured; n = 2. Confidence: medium.
- Verifier: confirmed.
- Sources: lanes/l8-azure-bench/round2/results/stt_india.csv

**LAT-07** (round 2, r2-latency-india). LLM time to first token from Central India, n=33 per arm, ~1.6k-token prompt, async filter: South India Standard gpt-4.1-mini 304 ms (298-322); SEA GS gpt-5.4-nano 577; FRC DZ-EU DeepSeek-V4-Flash 816, gpt-6-luna 883, gpt-6-sol 1,005; APAC DZ gpt-6.1-sol 1,814 (one 8-minute off-peak window).
- Value: 304 (fastest of 11 arms) (ms). Date: 2026-10-17. Method: measured; n = 33. Confidence: medium.
- Verifier: confirmed (needs weekday-peak repeat).
- Sources: lanes/l8-azure-bench/round2/results/llm_india.csv; lanes/l8-azure-bench/round2/results/llm_india_summary.csv

**LAT-08** (round 2, r2-latency-india). gpt-4.1-mini 2025-04-14 shows lifecycleStatus Legacy (Standard deprecationDate 2027-04-14) in the Models API, but Microsoft's retirement schedule lists it Deprecated (may block subscriptions that never deployed it); the only India-geography Standard chat models (gpt-4.1-mini, gpt-4o 2024-11-20) both retire 2027-04-14.
- Value: retires 2027-04-14 (date). Date: 2026-09-21. Method: read-primary + measured (ARM read). Confidence: high.
- Verifier: weakened (status conflict; new-subscription risk).
- Sources: https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule; https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/model-retirements; https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/deployment-types

**LAT-09** (round 2, r2-latency-india). Voice Live from India (first audio p50, n=30 turns each): gpt-4.1-mini regional 1,377 ms (1,283-1,414); text-gated mode 1,175 ms; azure-realtime 1,616; gpt-realtime-2.1 regional 1,414.
- Value: 1,377 / 1,175 gated (ms). Date: 2026-10-17. Method: measured; n = 30. Confidence: medium.
- Verifier: regions table confirmed; latencies not separately recomputed. **Supersedes:** LAT-01 (Voice Live).
- Sources: lanes/l8-azure-bench/round2/results/voicelive_india_summary.csv; https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions

**LAT-10** (round 2, r2-latency-india). STT endpointing in Central India (hi-IN, phone band): final after speech end p50 450 ms (300 ms segmentation), 622 (500), 985 (800), 848 Semantic (p90 1,609); first partial 924-926 ms after speech start; finals fired inside pauses shorter than the timeout on 3/10 elderly clips.
- Value: 622 at 500 ms (ms). Date: 2026-10-17. Method: measured; n = 29. Confidence: medium.
- Verifier: weakened (6/10 miscounted; true 3/10).
- Sources: lanes/l8-azure-bench/round2/results/stt_india.csv; lanes/l8-azure-bench/round2/results/stt_india_summary.csv

**LAT-12** (round 2, r2-latency-india / r2-model-corrections). Network from the Central India VM: TCP connect ~2.6 ms to Central India Speech, 26 ms to South India Azure OpenAI, ~55 ms to Southeast Asia, 124 ms to France Central; Microsoft's table gives Central India -> France Central 135 ms (118 ms is France South).
- Value: 2.6 / 26 / 55 / 124 (ms TCP connect). Date: 2026-10-17. Method: measured + read-primary; n = 30. Confidence: high.
- Verifier: confirmed. **Supersedes:** l8 'Central India -> France Central 118 ms'.
- Sources: lanes/l8-azure-bench/round2/results/netprobe_summary.csv; https://learn.microsoft.com/en-us/azure/networking/azure-network-latency

**LAT-13** (round 2, r2-latency-india). Caller-perceived latency with the telephone leg is an estimate: Twilio budget 0.23-0.30 s; Indian CPaaS assumed 0.25-0.45 s; config A estimated 1.25-1.45 s p50 at the handset.
- Value: 1.25-1.45 s (estimate). Date: 2026-10-17. Method: assumption / estimate. Confidence: low.
- Verifier: not measured.
- Sources: lanes/l8-azure-bench/round2/results/cascade_main_summary.csv

**LAT-14** (round 1, l8). Azure continuous language ID labelled Kathbath Hindi as Marathi: 14/60 correct (WER 41%); pinned engines 30-32/32 on short answers.
- Value: 14/60 (clips). Date: 2026-10-17. Method: measured; n = 60. Confidence: medium.
- Verifier: weakened (gpt-4o failures mostly not wrong-script).
- Sources: lanes/l8-azure-bench/results

**LAT-15** (round 1, l8). gpt-4o-transcribe invented words on 17/49 non-speech clips (sound labels excluded; 29/49 with labels); Azure real-time and fast transcription 0/49.
- Value: 17/49 (clips). Date: 2026-10-17. Method: measured; n = 49. Confidence: medium.
- Verifier: weakened (sound labels and no language hint).
- Sources: lanes/l8-azure-bench/results

**LAT-16** (round 1, l7). Open ASR fabricates on non-speech: 30/30 clips; Qwen3-ASR wrote 'हाँ' on 24/25 non-babble clips; whisper wrote 'झाल' on 22/25.
- Value: 30/30; 24/25; 22/25 (clips). Date: 2026-10-17. Method: measured; n = 30. Confidence: high.
- Verifier: confirmed (whisper count fixed 23->22).
- Sources: lanes/l7-tech-frontier/asr_bench

**LAT-17** (round 1, l8). Generative TTS misread INR 1,299 in 10/13 renders of one preview voice (Diya Dragon); generative 3/99 vs neural 0/80 misreads overall (Fisher p=0.25).
- Value: 10/13; 3/99 vs 0/80 (renders). Date: 2026-10-17. Method: measured; n = 179. Confidence: medium.
- Verifier: weakened (not significant overall).
- Sources: lanes/l8-azure-bench/results/tts_summary.csv

**LAT-19** (round 1, l7). No gateable Indic full-duplex speech-to-speech model exists: PersonaPlex, NVIDIA VoiceChat-11B and Moshi are English-only; Azure realtime emits audio before any text gate.
- Value: none (finding). Date: 2026-10-17. Method: read-primary (model cards). Confidence: high.
- Verifier: confirmed.
- Sources: https://huggingface.co/pipecat-ai/phonellm-alpha-1; lanes/l7-tech-frontier/radar.csv

**LAT-20** (round 1, hv / l8v). Inherited (harvest) measurements: end-of-turn p50 1,480 ms against a 900 ms bar; Voice Live empty transcripts on 5/14 short answers; agent lane 4.0-4.8 s p50 end to end; human turn gaps ~0.2 s.
- Value: 1,480 ms; 5/14; 4.0-4.8 s (ms / turns). Date: 2026-10-15. Method: measured (owner, inherited); n = 14. Confidence: high (mechanics).
- Verifier: n/a.
- Sources: docs/harvest/SYNTHESIS.md

**LAT-22** (round 2, r2-latency-india). Round-2 latency resources (VM, AI Services accounts, deployments) were created and deleted inside vp-research-rg on 2026-10-17 (deleted 18:32-18:33 UTC); ~INR 600 spent against the INR 1,500 cap.
- Value: ~600 (INR). Date: 2026-10-17. Method: measured; n = 21. Confidence: high.
- Verifier: deletion verified by ARM list.
- Sources: lanes/l8-azure-bench/round2/resources-created.csv

## Learning and experimentation (H7)

**LRN-01** (round 1, l6). Calls per arm at alpha 0.05, power 0.80: 50%->45% 1,565; 30%->27% 3,554; 20%->15% 906; at 100 calls per arm the minimum detectable drop is 13-19 points.
- Value: 906-3,554 per arm (calls). Date: 2026-10-17. Method: computed. Confidence: high.
- Verifier: confirmed.
- Sources: lanes/l6-self-learning/data/power-n-per-arm.csv; lanes/l6-self-learning/data/power-what-100-tells.csv

**LRN-02** (round 1, l6v). Daily-checked A/A tests with P(best) >= 0.95 and K=2 variants declare false winners in 52-62% of runs by day 90 (4-14% at K=4, ~20-24% at K=3).
- Value: 52-62% (false-winner rate). Date: 2026-10-17. Method: computed (simulation); n = 4000. Confidence: high.
- Verifier: weakened (lane quoted K=4 only). **Supersedes:** l6 lane '4-14% at any volume'.
- Sources: lanes/l6-self-learning/data/power-peeking-aa.csv; lanes/l6-self-learning/verify.md

**LRN-03** (round 1, l6). Line mining: a line that doubles the hang-up hazard (5%->10%) is flagged 67% of the time at 500 calls and 76-94% at 1,000; only 19-37% at 100-200 calls.
- Value: 67% at 500 (detection rate). Date: 2026-10-17. Method: computed (simulation); n = 3000. Confidence: medium.
- Verifier: weakened ('works at hundreds' overstated).
- Sources: lanes/l6-self-learning/data/dropoff-mining.csv

**LRN-04** (round 1, l6). Confirming a fix that halves a 10% line hazard needs ~435 callers per arm reaching the line (~592 calls per arm).
- Value: ~592 (calls per arm). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: weakened (reference curve assumed known).
- Sources: lanes/l6-self-learning/data/dropoff-mining.csv

**LRN-05** (round 1, l6). Thompson sampling with 4 variants and a +10% relative lift at 1,000 calls/day picks the right arm 86-99% of the time, median correct declaration day 18; outcome optimisation needs ~1,000 calls/day per script.
- Value: 86-99% (correct-selection rate). Date: 2026-10-17. Method: computed (simulation). Confidence: high.
- Verifier: confirmed.
- Sources: lanes/l6-self-learning/data/sim-bandit-summary.csv

**LRN-06** (round 1, l6). Pooling learning across dissimilar tenants gave the wrong winner to 48-55% of tenants under the lane's empirical-Bayes estimator.
- Value: 48-55% (share of tenants). Date: 2026-10-17. Method: computed (simulation); n = 30. Confidence: medium.
- Verifier: weakened (one estimator).
- Sources: lanes/l6-self-learning/data/sim-hierarchical.csv

**LRN-07** (round 1, l6). If outcome labels come from an LLM judge with 90% accuracy, calls needed rise 1.8-2.4x (3.6-5.5x at 80%); outcome-extraction accuracy on sales transcripts was never measured.
- Value: 1.8-2.4x (sample inflation). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: weakened (inherited judge data were companion replies).
- Sources: lanes/l6-self-learning/data/dropoff-label-noise.csv

**LRN-08** (round 1, l6 / hv). The only live trial of stored per-contact language preference failed: a correction stored Hindi and the reply came in English.
- Value: 1 failed trial (trial). Date: 2026-08. Method: measured (owner, inherited); n = 1. Confidence: high.
- Verifier: n/a.
- Sources: docs/harvest/hp-handoffs.md

**LRN-09** (round 1, l6). Vendor experimentation: Retell, Vapi, ElevenLabs and Bland ship fixed traffic splits with manual promotion and no statistics; SquadStack markets a self-improvement layer that 'continuously tunes agent scripts'; Bland's Tornado loop applies fixes.
- Value: no statistics (finding). Date: 2026-10-17. Method: read-primary (vendor docs). Confidence: medium.
- Verifier: weakened (counter-examples exist).
- Sources: https://docs.retellai.com/deploy/ab-testing.md; https://docs.vapi.ai/assistants/versioning/traffic-splitting.md; https://elevenlabs.io/docs/eleven-agents/operate/experiments.md; https://docs.bland.ai/llms.txt; https://www.squadstack.ai/

## Human-likeness, language, dialect and the listener panel

**HUM-01** (round 1, l5). Disclosing an AI voice bot before an outbound sales call cut the purchase rate from 0.237 to 0.048 and 56.3% hung up within 5 s (Luo et al. 2019, pre-2019 experiment, n=6,255).
- Value: 0.237 -> 0.048 (purchase rate). Date: 2019. Method: read-primary; n = 6255. Confidence: high.
- Verifier: confirmed.
- Sources: doi:10.1287/mksc.2019.1192; lanes/l5-human-dialect/evidence.csv

**HUM-02** (round 1, l5). Habel, Zawadzki, Freise 2026 (SSRN 7013259, abstract via Crossref): disclosure no longer reduces conversion (n=1,337); AI voice agents still underperform humans on sales-process discipline (n=366); customers recognise AI regardless of disclosure (n=238) and are less willing to continue the conversation.
- Value: null disclosure effect (finding). Date: 2026-07-20. Method: read-secondary (abstract only; setting unknown); n = 1337. Confidence: medium.
- Verifier: confirmed at abstract level.
- Sources: doi:10.2139/ssrn.7013259; lanes/l5-human-dialect/evidence.csv

**HUM-03** (round 1, l5). AI vs human collectors (NBER WP 33669; scripted bot, China, 2021-23): NPV -9 pp at ~1 month (RD), -12 pp by day 5 (randomised); AI not hung up on more within 10 s; conversations 31 s shorter; 21 pp fewer promises; the promise channel 'may contribute'.
- Value: -9 / -12 pp (NPV collected). Date: 2025-04. Method: read-primary. Confidence: high (numbers) / medium (mechanism).
- Verifier: weakened (causal framing).
- Sources: NBER WP 33669 (Choi, Huang, Yang, Zhang 2025); lanes/l5-human-dialect/evidence.csv

**HUM-04** (round 1, l5). Vendor-funded study of ~99,400 US survey calls, all opening with AI disclosure: intro hang-up 87.9-90.3% across TTS vendors (range 2.4 pp).
- Value: <=2.4 pp (hang-up difference). Date: 2026. Method: vendor-claim; n = 99400. Confidence: low-medium.
- Verifier: not disputed (vendor-funded).
- Sources: https://www.rime.ai/resources/which-ai-voice-keeps-people-on-the-phone

**HUM-05** (round 1, l5). Anthropomorphic chatbots lower satisfaction and purchase intent for customers who arrive angry (Crolic et al.); humanising raised conversion but also raised scrutiny (Schanke et al.).
- Value: backfire when angry (finding). Date: 2021. Method: read-secondary (abstracts) / read-primary. Confidence: medium.
- Verifier: not disputed.
- Sources: doi:10.1177/00222429211045687; doi:10.1287/isre.2021.1015

**HUM-06** (round 2, r2-model-corrections). Tamil named in Apna phone-job postings after removing the 'Tamil Nadu' address artefact: Chennai 121/360 (33.6%), Coimbatore 19/78 (24.4%) in free text (upper bound; 20.6% / 15.4% in Apna's structured field); Hyderabad Telugu 39.8%, Bengaluru Kannada 34.3%.
- Value: 33.6% / 24.4% (share of postings). Date: 2026-10-17. Method: computed (crawl); n = 6454. Confidence: medium.
- Verifier: verifier figures reproduced. **Supersedes:** l5 lane 82.8% / 91.0%.
- Sources: lanes/l5-human-dialect/job-language-requirements-by-city.csv; lanes/l5-human-dialect/job-language-structured-field-by-city.csv

**HUM-07** (round 2, r2-model-corrections). Dialect asks in Hindi-belt phone-job postings: 1 (Marwari, a Jaipur NBFC collections role) in 828 postings across 29 cities.
- Value: 1/828 (postings). Date: 2026-10-17. Method: computed; n = 828. Confidence: medium.
- Verifier: reproduced. **Supersedes:** l5 '1 in ~460'.
- Sources: lanes/l5-human-dialect/job-language-requirements-by-city.csv

**HUM-08** (round 1, l5). Azure has Bhojpuri (bho-IN) speech-to-text but no text-to-speech locale for any Hindi-belt dialect; ta-IN has only 2 voices; no Bhojpuri TTS on Azure, Sarvam, IndicF5 or Indic Parler.
- Value: bho-IN STT only (capability). Date: 2026-10-17. Method: read-primary + measured; n = 72. Confidence: high.
- Verifier: confirmed.
- Sources: lanes/l5-human-dialect/azure-voices-indic-2026-10-17.csv; lanes/l5-human-dialect/evidence.csv

**HUM-09** (round 1, l5). Bhojpuri marker words recovered from stock hi-IN voices under bho-IN ASR: 8-10/13 strict, 11-12/13 lenient (LLM-written stimulus, n=1 script, unreviewed).
- Value: 8-10/13 strict (markers). Date: 2026-10-17. Method: measured; n = 13. Confidence: low.
- Verifier: weakened.
- Sources: lanes/l5-human-dialect/samples

**HUM-11** (round 2, synthesis). 'Policyholders skew older and Hindi-belt' (SYNTHESIS r1 §1.1 item 9): no source found in round 1 or round 2.
- Value: unsourced (assumption). Date: 2026-10-17. Method: assumption. Confidence: low.
- Verifier: unsourced (critic A17); relabelled as assumption in v2.
- Sources: none (unsourced)

**HUM-12** (round 2, synthesis / r2-competition-measured). 'Renewal lists come as spreadsheets': no direct source; weak vendor evidence only (LSQ's Universal Sompo case says renewal data was in Excel before ~2018; Alliance Insurance Brokers runs its renewal team on LSQ CRM).
- Value: weak (assumption). Date: 2026-10-17. Method: assumption + vendor-claim. Confidence: low.
- Verifier: unsourced (critic A17); interview probe.
- Sources: https://www.leadsquared.com/case-studies/increased-new-lead-acquistion/; https://www.leadsquared.com/case-studies/alliance-insurance-brokers-improves-agent-productivity

**HUM-13** (round 2, synthesis / r2-untouched-raw). 'Fewer sub-10-s hang-ups means fewer spam flags' (r1 gap map): the naturalness-to-hang-up link is weak (AI not hung up more within 10 s) and short-call share separates spam only weakly (25% genuine vs 43% spam); 1600 CLIs cannot be flagged anyway.
- Value: weak link (finding). Date: 2026-10-17. Method: read-primary + interpretation. Confidence: medium.
- Verifier: relabelled (critic A17). **Supersedes:** r1 gap-map spam-flag row rationale.
- Sources: https://www.trai.gov.in/sites/default/files/2026-04/Airtels%20Response%20to%20Draft%20TCCCP%20%283rd%20Amendment%29%20Regulations%2C%202026.pdf

**HUM-14** (round 2, r2-listener-panel). Listener panel v2: all 8 rated turns are renewal calls; primary panels Hindi 60+ (48 analysed) and 18-59 (36); 210 Azure clips rendered (phone band and wideband); two-engine key-token ASR check passed 208/210; no person has heard any clip; owner cost ~INR 1.21-1.54 lakh for the main four panels.
- Value: 210 clips; 208 passed (clips). Date: 2026-10-17. Method: measured (render QA) + plan; n = 210. Confidence: high (design facts).
- Verifier: not verified.
- Sources: listener-panel/protocol.md; listener-panel/panel-predictions.md; lanes/l8-azure-bench/stimuli-round2/manifest.csv

**HUM-15** (round 2, r2-listener-panel). Tamil text normalisation read vehicle digits plus a date as '47 September 2,928' in all 4 Tamil voices; commas fixed it (product rule: a number regression test per locale); HD voices misread 2/102 amounts on first render vs 0/50 neural (not significant).
- Value: 4/4 voices (renders). Date: 2026-10-17. Method: measured; n = 152. Confidence: medium.
- Verifier: not verified.
- Sources: lanes/l8-azure-bench/stimuli-round2/qa-attempts.csv

## Founder kit (pre-registered interview rules)

**FK-01** (round 2, r2-founder-kit). Interview sample re-stratified to the pool: 20 active insurance targets = A small/mid retail brokers 6, B non-bank corporate agents 5, C IMFs 6, D large brokers/platforms 3; 9 new companies confirmed in live IRDAI registers (2026-10-17 20:08 UTC); 5 rows from a seeded random register draw; wave 1 on 2026-10-19 = A5/B4/C4/D2.
- Value: 6 / 5 / 6 / 3 (targets). Date: 2026-10-17. Method: measured (register fetch) + plan; n = 20. Confidence: high.
- Verifier: not verified. **Supersedes:** round-1 kit (13 brokers, 4 PoSP platforms, 2 CAs, 1 IMF).
- Sources: founder-kit/targets.csv; founder-kit/strata.csv; founder-kit/register-sample-frame.csv

**FK-02** (round 2, r2-founder-kit). Kill criterion 2 restated as per-line 40%-launch-margin fee floors: 2W INR 29, car 28, health 14, life 17 (car 35, health 19, life 24 if only post-first-attempt renewals are billable); the INR 150-per-save floor is retired.
- Value: 29 / 28 / 14 / 17 (INR per renewal collected). Date: 2026-10-17. Method: computed (pre-registered). Confidence: medium.
- Verifier: not verified. **Supersedes:** SYN1-02.
- Sources: founder-kit/scoring.md; founder-kit/kc-answer-sheet.md; lanes/l2-economics/round2/renewal-pricing-grid.csv

**FK-03** (round 2, r2-founder-kit). Kill criterion 3 restated as per-line break-even no-call renewal ratios: 2W 63%, car 96%, health 97%, life 93% (round-1 90% line also reported).
- Value: 63 / 96 / 97 / 93% (no-call renewal ratio). Date: 2026-10-17. Method: computed (pre-registered). Confidence: medium.
- Verifier: not verified. **Supersedes:** r1 KC3 '>=90% without calling'.
- Sources: founder-kit/kc-answer-sheet.md

**FK-04** (round 2, r2-founder-kit). Kill criterion 1 decision rule: fires if the firm-weighted share of firms at or above ~6,800 due a month (or 3x their own due-per-caller) is below 1/3, weights A/B/C 0.21/0.26/0.52, >=3 in-scope interviews per stratum; if the volume-weighted share is >=1/3 the beachhead moves to the larger strata instead of dying.
- Value: p_firm < 1/3 (decision rule). Date: 2026-10-17. Method: pre-registered rule. Confidence: high.
- Verifier: not verified. **Supersedes:** r1 KC1 '<5 of 15 run >=3 renewal telecallers'.
- Sources: founder-kit/scoring.md; founder-kit/kc-answer-sheet.md

**FK-05** (round 2, r2-economics-renewal / r2-founder-kit). Concept-test price card: INR 50 per car renewal, 15 per health or life renewal, 20 per bike renewal collected on the AI-worked list; INR 15k monthly minimum credited against usage; 10% holdout never billed.
- Value: 50 / 15 / 15 / 20; 15k minimum (INR). Date: 2026-10-17. Method: computed (decision rule on the Monte Carlo grid); n = 20000. Confidence: medium.
- Verifier: weakened by r2-econ verifier (minimum not derived; life fee at observed commission ~INR 10; quarterly holdout is noise for health and life). **Supersedes:** SYN1-01.
- Sources: founder-kit/interview-guide.md; lanes/l2-economics/round2/renewal-model.json

## Round-1 SYNTHESIS positions superseded in round 2

**SYN1-01** (round 1, synthesis r1). R1 price: effective yield INR 6-8 per AI-connected minute, ~INR 1.1-1.5 lakh/month for a median modelled buyer.
- Value: 6-8 INR/AI-min (yield). Date: 2026-10-17. Method: computed from assumptions. Confidence: low.
- Verifier: superseded (REN-06, FK-05).
- Sources: SYNTHESIS.md

**SYN1-02** (round 1, synthesis r1). R1 kill criterion 2: accepted price below ~INR 6/min-equivalent or below INR 150 per renewal saved.
- Value: 150 (INR per save). Date: 2026-10-17. Method: assumption (value gate mixed insurer premium). Confidence: low.
- Verifier: superseded (REN-05, FK-02).
- Sources: SYNTHESIS.md; lanes/l3-segments/value-gate.csv

**SYN1-03** (round 1, synthesis r1). R1 open question 1: whether IRDAI's 1600 mandate covers intermediaries is unverified (treated as ~50/50).
- Value: unknown (scope). Date: 2026-10-17. Method: read-primary (direction text not applied). Confidence: low.
- Verifier: superseded (REG-20: mandatory for all intermediaries).
- Sources: SYNTHESIS.md

**SYN1-04** (round 1, synthesis r1). R1 tie-breaker: competition is thin at this buyer (SquadStack and Gnani sell to insurers, not intermediaries).
- Value: thin (finding). Date: 2026-10-17. Method: read-primary (vendor pages). Confidence: low.
- Verifier: superseded (CMP-13: does not hold at the job level).
- Sources: SYNTHESIS.md

**SYN1-05** (round 1, synthesis r1). R1 kill criterion 6 treated as a future test; our cascade estimated 2.2-4 s from Ohio.
- Value: 2.2-4 s est. (latency). Date: 2026-10-17. Method: estimate. Confidence: low.
- Verifier: superseded (LAT-02, LAT-05).
- Sources: SYNTHESIS.md

**SYN1-06** (round 1, synthesis r1). R1 margin at scale: 49-62% at INR 3.06 COGS (1M min/month).
- Value: 49-62% (gross margin). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: superseded (ECO-10).
- Sources: SYNTHESIS.md

**SYN1-07** (round 1, synthesis r1). R1 owner item 3: decide by 2026-10-23 whether to create an ACS resource to keep phone-number eligibility (default no).
- Value: decision (owner item). Date: 2026-10-17. Method: read-primary. Confidence: medium.
- Verifier: superseded (REG-37: moot, no action).
- Sources: SYNTHESIS.md

**SYN1-08** (round 1, synthesis r1). R1: residency matters only for alternate 2 (RBI) or insurer outsourcing clauses.
- Value: alternate-2 only (scope). Date: 2026-10-17. Method: inference. Confidence: low.
- Verifier: superseded (REG-31: intermediary records in India >=10 years).
- Sources: SYNTHESIS.md

**SYN1-09** (round 1, synthesis r1). R1 wedge rule: never promote or cross-sell inside a call; VP is a managed, compliance-carrying renewal caller.
- Value: never promote (product rule). Date: 2026-10-17. Method: read-primary (TRAI). Confidence: medium.
- Verifier: superseded by 'inform, confirm, hand off' as software on the intermediary's own 1600 number (REG-26, REG-27, REG-29, REG-30).
- Sources: SYNTHESIS.md

**SYN1-10** (round 1, synthesis r1). R1: lending pre-due reminders rank #4 on the frozen scorecard (alternate 2).
- Value: #4 (rank). Date: 2026-10-17. Method: computed. Confidence: medium.
- Verifier: weakened (SEG-02: #8 with post_sales_share = 0; #13 on S1).
- Sources: SYNTHESIS.md

**SYN1-11** (round 1, synthesis r1). R1 gap-map row 'Renewal calling for insurance intermediaries': voice-AI incumbents sell to insurers, not to the ~2,500 intermediaries.
- Value: unserved (gap). Date: 2026-10-17. Method: read-primary (vendor pages). Confidence: low.
- Verifier: narrowed (CMP-13: only a managed per-renewal service for small/mid intermediaries is unoffered).
- Sources: SYNTHESIS.md

**SYN1-12** (round 1, synthesis r1). R1 §1.1 item 5: LeadSquared insurance CRM plus Invorto claims a +10% renewal ratio at Universal Sompo.
- Value: +10% (renewal ratio). Date: 2026-10-17. Method: vendor-claim. Confidence: low.
- Verifier: superseded (CMP-15: CRM case, no voice AI).
- Sources: SYNTHESIS.md
