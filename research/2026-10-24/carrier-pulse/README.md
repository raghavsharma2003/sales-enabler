# Carrier billing pulse for Indian outbound calls

Fetched 2026-10-24 with `curl -sSL`, saved byte for byte under `raw/`; `sources.json` lists every URL tried, its file and
fetch time, including the three that could not be fetched. `product/server/modules/money/carriers.ts` uses only what these
pages state; `product/tests/money-pulse.test.ts` checks each stated pulse against the saved text. Unknown is "not published".

| Carrier | Outbound rate (as stated) | Pulse (as stated) | Recommended (pulse <= 30 s) | Where |
|---|---|---|---|---|
| Plivo India (wired) | ₹0.38/min | **30 seconds**: "Pulse is 30 seconds"; "India data region ... standard 30/30" | yes | voice/pricing/in; billing-concepts.md |
| Exotel | not published | not published ("per second ... or per-pulse as per plan") | unknown | developer FAQ pricing-plans.md; exotel.com/pricing (no figure) |
| Twilio India | $0.0699/min local, $0.0496/min mobile | not published on the saved page (the rounding help article returned 403) | unknown | voice/pricing/in |
| Knowlarity | not fetched | not published | unknown | TLS failure through the proxy |
| Tata Tele Business (Smartflo) | not fetched | not published | unknown | proxy 502 |
| Airtel IQ | not published | not published | unknown | page renders in the browser only |

**Conflict to settle:** our voice lab read a 60-second pulse on the Plivo console on 2026-10-19 (`voicelab/server/phone.py`),
against the 30 seconds both public pages state today. Estimates use the published 30 s and say so; the first Plivo invoice
settles which applies. Search snippets (not saved, so not used) claimed a 60 s default for Exotel and whole-minute
rounding for Twilio; they stay "not published" here until a saved page states them.
