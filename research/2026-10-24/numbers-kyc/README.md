# Number series: KYC, time and price, from the carrier's public pages

Fetched 2026-10-24 (05:28 UTC) with `curl -sSL`, saved byte for byte under `raw/`; `sources.json` maps each URL to its
file and fetch time. `product/server/modules/campaigns/telephony.ts` `SERIES_GUIDE` uses only what these pages state;
`product/tests/numbers-kyc.test.ts` checks every figure against the saved text. Anything not stated reads "not published".

| Series (our id) | What the carrier asks for | Typical time (as stated) | Monthly price (as stated) | Source |
|---|---|---|---|---|
| Landline 080/022 (`ten_digit`) | One of GST certificate, Certificate of Incorporation, Udyam registration; first application signed and sealed; business PAN alone rejected | "typically within 5 minutes" (automated review) | "Domestic Numbers ... ₹200.00/month" | rent-india-numbers.md; pricing/in |
| 160-series (`1600`) | Regulator + licence number; Tata DLT PE (and TM) registration; BFSI Customer Application Form and Aggregator Telemarketer Declaration, signed and sealed; voice header and template approval | "~7–14 business days" | not published | 160-series-provisioning.md |
| 140-series (`140`) | Tata DLT PE + TM registration; active GST registration; Aggregator Telemarketer Declaration, signed and sealed; voice header approval | "~5–10 business days" | not published | 140-series-provisioning.md |
| 1601 (`1601`) | not published | not published | not published | (no page found) |
| Mobile | not published | not published | not published | (no page found) |

Caveats stated by the carrier: 140 and 160 provisioning only through Tata Teleservices DLT, and only for telemarketers
registered in Mumbai or Karnataka; India numbers need an India-data-region account. These are Plivo's terms as of the
fetch date, not verified on a live account.
