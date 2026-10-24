<!-- Recovered 2026-10-17 by the coordinator: the subagent harness refused this Write; content is the agent's own text, unchanged. -->

# Lane l4c: incumbents and distribution (H8, H10)

Date: 2026-10-17. Lane cap: INR 0 of Azure spend; nothing was spent and no paid calls were made.
Everything here is desk research, plus four small measurements we ran ourselves:

- Zoho's own INR price JSON
- Trustpilot complaints, scraped and coded
- Zoho Marketplace search counts
- revenue-per-customer computed from filings

The data files sit next to this report:

- `incumbents.csv`: 21 vendors
- `channels.csv`: 14 channels
- `data/arpa.csv`
- `data/h8-context-evidence.csv`
- `data/incumbent-complaints.csv` and `data/incumbent-complaint-summary.csv`
- `data/payment-terms.csv`
- `data/zoho-inr-prices.csv`
- `data/blocked-sources.csv`

The code is in `code/`.

Sibling lanes I reused and did not re-derive:

- l4a: voice-AI vendor pricing, MCA financials for Exotel, Ozonetel, SquadStack and Gnani, and a complaint corpus for voice-AI platforms
- l3: the segment scorecard and modelled tickets
- l1: WhatsApp rates and the TRAI use-case map
- `docs/harvest/`: the CommandCentre cold-email funnel

---

## 1. Answer to the hypothesis

### H8: "Company context and the command centre are a wedge, not a delay"

**Verdict: context is part of the wedge; the command centre is a delay.**

The research splits H8 into two claims that the brief bundled together.

1. **Customer-specific context does lift outcomes. The evidence is moderate and none of it is from voice AI.** In randomised field experiments, messages that carry the recipient's own context beat generic ones:
   - Goal-specific savings reminders raised saving by 16% against no reminder. Generic reminders had no significant effect (Karlan et al., Management Science 2016).
   - A loan officer's name in an SMS improved repayment, but only for borrowers who already knew that officer (Karlan, Morten and Zinman, NBER w17952, 2012).
   - Putting the recipient's name in an email subject line raised sales leads by 31% (Sahni, Wheeler and Chintagunta, 2016).
   - A two-way phone call with a bank agent raised timely repayment by 34.4 percentage points (local average treatment effect; the ATE is about half). The likeability of the agent's voice mattered (Laudenbach, Pirschel and Siegel, Journal of Finance 2025; n = 3,448).

   We found no rigorous study of an AI voice agent with CRM context, in India or elsewhere. Vendor case studies with numbers exist (SquadStack, Sell.Do, LeadSquared), but each is a vendor claim with no control group.

2. **A beachhead call needs only a small amount of context, and buyers already hold it somewhere else.** For an insurance renewal that means:
   - name, policy, insurer, premium and due date
   - language
   - the last interaction
   - consent

   For a real-estate inquiry it means project, budget and source. l3 found that insurance renewal lists come as spreadsheets. The LeadSquared and Universal Sompo case shows renewal data lived in Excel until a CRM arrived. None of this requires VP to own the CRM, ERP or campaign system. It requires:
   - a CSV or Google Sheet import
   - a webhook or connector for LeadSquared, Zoho or Kylas
   - write-back of call outcomes

3. **The incumbents that own the records are already bundling voice.** All dated, accessed 2026-10-17:
   - LeadSquared lists "Invorto Voice AI" on its homepage. A job post dated 2026-05-11 describes it as a Pipecat cascade (STT, then LLM, then TTS).
   - Sell.Do, a real-estate CRM claiming 1,500+ firms, ships an AI voice agent that calls new portal leads.
   - Salesforce announced Agentforce Voice in Hindi on 2026-05-19.
   - Exotel sells a GenAI voicebot and an open bring-your-own-bot stream, AgentStream (2025).
   - Gupshup sells self-serve voice agents from $0.035 (INR 3.50) per minute.
   - MyOperator sells an AI voice agent at INR 10,000 a month for 2,000 minutes.
   - Tata Communications and TTBS launched an SMB voice agent through TTBS's channel on 2026-07-28.

   We found no shipped Indic calling agent at Zoho, Kylas, Freshworks, AiSensy, WATI, Interakt, LimeChat or MSG91. HubSpot's voice channel is reported as beta. Zoho has built Hindi and English ASR models and a free agent builder, so it could close this gap quickly.

   A buyer who already owns a CRM will increasingly get "good enough" voice bundled into it. VP wins only by being measurably better on the call, not by being a bigger suite.

4. **Indian buyers adopt point tools first and grow into suites.**
   - Zoho One, Zoho's all-in suite, had 50,000+ businesses on its five-year page (2022). Zoho had over 1 million paying customers by 2026-02-18, so roughly 5% buy the suite. The two figures are from different dates.
   - The same Zoho page says "24% of businesses choose to buy Zoho One on day one". The page does not give the denominator. Our preferred reading is that 76% of Zoho One customers arrived through single apps first.
   - LeadSquared's wedge was a vertical, not a suite: education was nearly 40% of its business at one point. It sells through inside and field sales. Channel revenue was a "high single-digit" percentage in 2021.
   - Tally is the accounting system of record for about 27 lakh customers, and the ecosystem plugs into it rather than replacing it.

5. **Buyers switch CRMs for three reasons, and voice AI is not one of them.** The reasons we found:
   - vertical workflow fit: Alliance Insurance Brokers left Zoho for LeadSquared because they could not customise insurance workflows
   - per-seat price: Kylas sells a flat INR 12,999 a month with unlimited users against per-seat rivals
   - broken integrations, which appear in 19 of our 111 coded complaints

   We found no case of an Indian business switching CRM to get voice AI.

**Conclusion: wedge-first, and the wedge should be context-aware.** VP should ship a voice agent that:
- plugs into the buyer's existing spreadsheet, CRM, telephony number and WhatsApp
- reads the small context it needs
- writes outcomes back

The command centre (CRM, ERP, campaigns, SEO and so on) should be the expansion path, earned account by account. H8's own kill condition ("buyers in the beachhead want a point tool that plugs into what they already have") is met on desk evidence. It still has to be confirmed in the owner's discovery interviews.

### H10: "We can reach the beachhead's buyers at an acceptable cost"

**Verdict: yes for an enumerable B2B segment through founder-led direct sales. The cheap, scalable channels mostly lead to low tickets or to partners that now compete with us.**

**Ticket sizes.** Computed as filed or claimed revenue divided by claimed customers, in `data/arpa.csv`:

| Vendor or segment | INR per customer per month | Note |
|---|---|---|
| Bolna (self-serve voice AI) | ~4,900 | $700k ARR, 1,050 customers |
| Zoho suite | ~5,900 | global |
| Ozonetel | ~26,000–37,000 | |
| Exotel (domestic) | ≤ ~49,500 | |
| Gupshup | ≤ ~51,000 | global |
| LeadSquared | ~1.7 lakh | |
| Gnani (enterprise voice AI) | ~2.2–2.4 lakh | |
| l3 model: insurance renewals | ~1.03 lakh | median ticket |
| l3 model: real estate | ~64,000 | median ticket |
| l3 model: D2C | ~19,000 | median ticket |

The owner's "INR 25k–2L a month" band is where sales-led mid-market vendors sit. Self-serve voice AI sits an order of magnitude lower.

**Payment terms.** Indian SMB software is bought on annual or quarterly prepay and prepaid credits, plus 18% GST, often with TDS withheld:
- Zoho discounts annual prepay by 38% on CRM Standard.
- Kylas, Interakt and Knowlarity sell no monthly plan.
- Exotel, AiSensy and WATI run prepaid credit wallets, and refusals to refund unused credits recur in complaints.
- RBI's E-mandate Framework, 2026 (21 April 2026) caps card and UPI auto-debit without extra authentication at INR 15,000 per debit. A ticket above about INR 15k a month therefore moves to invoices, NEFT and annual or quarterly prepay. A self-serve flow alone does not get that money.

**Sales cycle.**
- Pilots run 2–8 weeks. SquadStack's FAQ says 3–8 weeks; Caller.Digital, a vendor, says 2–4 weeks for a pilot and 8–12 weeks to production.
- BFSI enterprise cycles are longer. SquadStack's engagement terms mention a 90-day commitment, and its PoCs convert to production 93% of the time (a vendor claim).

**Churn signals.**
- Ringg's founder said in TechCrunch (2026-08-25) that outbound, lead-qualification and collection calling "are not sticky use cases, and so it's always going to be a price game".
- In incumbents' 111 one- and two-star reviews, the top complaint codes are support (68%), billing, refunds and cancellation (27%), and implementation delay (23%). Feature gaps rank lower.
- Freshworks' net dollar retention fell to 104% in Q2 2026.
- We found no primary data on Indian SMB churn.

**Customer acquisition cost.** We found no primary Indian figure. The proxies:
- LeadSquared spent INR 18 Cr on advertising (5.5% of revenue) against INR 280 Cr of employee cost in FY25, so acquisition is people-heavy.
- Exotel spent 2.5% of revenue on advertising.
- The inherited CommandCentre cold-email funnel (a different ICP) produced 0 wins from 8,784 sends.

**Cheapest credible channel to l3's top segments:**
- **Insurance renewals (l3 rank 1).** Founder-led direct sales to the enumerable IRDAI register of about 2,500 intermediaries (l3), sold as an outcome-linked concierge pilot on the buyer's own renewal list. Calls run on the buyer's or a CPaaS's numbers through a bring-your-own-bot stream (Exotel AgentStream, Ozonetel SIP, or Vobiz), which l1 needs for the 1600 series. A LeadSquared or Zoho connector is built only when a customer needs it. One partnership with a PoSP platform (Turtlemint has 550,000+ PoSPs) is the scale option later.
- **Real estate (rank 2).** Contested: Sell.Do and LeadSquared bundle voice. The best partner is a CRM without voice, such as Kylas.
- **D2C (rank 3).** The Shopify App Store is the cheapest channel (no fee up to $1M of app revenue) but crowded and low-ticket.

---

## 2. Prediction check against predictions.md

| H | Prediction (prior) | Outcome | Why |
|---|---|---|---|
| H8 | Beachhead buyers will want a point solution that plugs into their existing CRM, telephony and WhatsApp. The command centre is an expansion path, not the wedge (0.70). | **Supported on desk evidence. Buyer interviews have not been run.** | Point-first adoption: Zoho One is about 5% of Zoho customers, and 24% buy it "on day one". LeadSquared's vertical wedge. Tally as system of record. CRM incumbents (LeadSquared, Sell.Do, Salesforce) and CPaaS incumbents (Exotel, Gupshup, MyOperator, TTBS) already bundle voice. No CRM switch driven by voice found. Context needed for renewals arrives as spreadsheets. Nuance the prediction missed: in real estate a point tool competes with a feature bundled into the vertical CRM, which is harder than plugging into a CRM with no voice. |
| H10 | Mid-market Indian B2C buyers buy through founders or ops heads at INR 25k–2L a month, with a 2–8 week sales cycle. CPaaS, telephony vendors and CRM partner ecosystems are major channels (0.50). | **Mixed.** | The ticket band is supported for sales-led mid-market (Ozonetel ~26–37k, Exotel ≤ ~50k, LeadSquared ~1.7L, Gnani ~2.3L ARPA, l3 tickets 19k–2.1L). It is refuted for self-serve (Bolna ~4.9k). 2–8 weeks holds for pilots, while production and BFSI enterprise run longer (8–12+ weeks, 90-day commitments). The buyer role (founders, ops heads) is consistent with SquadStack's "design days" and LeadSquared's field sales but untested. **Refuted as stated for channels:** CPaaS vendors now sell their own voice bots, so they are infrastructure and competitors, not resellers. LeadSquared's partner channel was only high single digits of revenue. CRM marketplaces are crowded: the Zoho Marketplace search for "telephony" returns 737 results. WhatsApp BSP partner networks are large (AiSensy claims 5,000+ partners) but sell text, not voice. |

---

## 3. Evidence

Methods: read-primary means we read the vendor, regulator or paper page ourselves. Read-secondary means press or an aggregator citing a filing. Computed means arithmetic on cited inputs. Vendor-claim means the vendor said it and nobody checked. All accessed 2026-10-17 unless dated otherwise.

### 3a. Incumbents: what they ship and charge

| Claim | Source | Date | Method | Confidence |
|---|---|---|---|---|
| Zoho CRM INR list prices per user per month, annual: Standard 800, Professional 1,400, Enterprise 2,400, Ultimate 2,600. Monthly: 1,300 / 2,100 / 3,000 / 3,200. Bigin 400 / 550. Zoho One 1,800 per employee annual, 2,500 monthly. Zoho Voice Basic 699–799. INR prices are about 35% below the USD list at INR 88. | zohowebstatic.com price JSON (crm, one, voice) | 2026-10-17 | read-primary, measured | high |
| Zia Agents and Agent Studio are free. Zoho-hosted models give 30M tokens a month free (Standard tier); bring-your-own-key is billed by the model vendor. | zoho.com/agents/pricing.html (estimates dated 2026-09-02) | 2026-09-02 | read-primary | high |
| Zoho launched Zia LLM (1.3B, 2.6B and 7B parameters), Hindi and English ASR, 25+ prebuilt agents, an Agent Marketplace and an MCP server, with GA expected at the end of 2025. No voice or call agent was mentioned. | Zoho press release | 2025-07-17 | read-primary | high |
| Zoho FY25 operating revenue was INR 12,313 Cr (suite 7,051; ManageEngine 4,863) and PAT 3,191 Cr. | Medianama, citing RoC filings | 2026-04 | read-secondary | medium-high |
| Zoho has more than 1M paying customers and 150M users. | CXOToday | 2026-02-18 | vendor-claim | medium |
| Zoho One has 50,000+ businesses, 20+ apps enabled on average, and "24% of businesses choose to buy Zoho One on day one" (denominator not stated). | zoho.com/one/zoho-one-turns-five.html | 2022 page | read-primary | medium (ambiguous) |
| LeadSquared FY25 operating revenue was INR 326 Cr (+14–17%), loss 89 Cr, advertising 18 Cr, employee cost 280 Cr. | Entrackr, citing RoC | 2025-10-14 | read-secondary | medium-high |
| LeadSquared lists Sales Pro at $60 and Sales Super at $100 per user per month (USD served to our IP) and claims 1,600+ customers. | leadsquared.com | 2026-10-17 | read-primary | high |
| LeadSquared markets "Invorto Voice AI" ("handles calls, qualifies leads, books follow-ups"). Its job post says Invorto is an STT-LLM-TTS pipeline on Pipecat. | leadsquared.com; hirist.tech job post | job dated 2026-05-11; site 2026-10-17 | read-primary | high |
| LeadSquared's channel revenue was a "high single-digit" percentage. It sells through inside and field sales in India and dropped freemium because customers were "not ready to set up and use the product on their own". | GTM Dialogues interview with Nilesh Patel | 2021-03-07 | read-primary (interview) | medium (dated) |
| Kylas Elevate is a flat INR 12,999 a month with unlimited users, sold quarterly, half-yearly or annually only. Onboarding costs INR 25,000. It claims "5000+" and "13,000+" businesses on the same page. No voice agent was found. | kylas.io pricing and home | 2026-10-17 | read-primary | medium |
| Sell.Do (real-estate CRM, "1,500+ real estate businesses") ships an AI voice agent that qualifies portal leads and books site visits. Its UI claims a median response of 11 s, down from 4 h, and 68% of leads qualified without a human. | sell.do/platform/ai-agents | 2026-10-17 | vendor-claim | medium (existence), low (numbers) |
| Salesforce launched Agentforce Voice in Hindi, with Hinglish switching. No price was given. | Salesforce India press release | 2026-05-19 | read-primary | high |
| Salesforce India FY25 revenue was INR 13,384.5 Cr (+47%). | Financial Express via NSE newspaper filing | 2025-11 | read-secondary | medium |
| Freshworks: Freddy AI Agent $49 per 100 sessions; Q2 2026 NDR 104% (105% at constant currency); 25,356 customers above $5k ARR. No confirmed voice agent. | freshworks.com pricing; Q2 2026 release coverage | 2026-08 | read-primary / secondary | medium-high |
| Bitrix24 India: Rs 1,910, 4,790, 9,590 and 19,190 per organisation per month, annual, for 5, 50, 100 and 250 users. | bitrix24.in/prices | 2026-10-17 | read-primary | high |
| Tally: about INR 852 Cr revenue in FY26 (unaudited) and about 27 lakh customers; "a lot of the business comes from existing customers". | PTI via Outlook Business | 2026-07-13 | read-secondary | medium |
| Exotel FY25 operating revenue was INR 490.5 Cr (domestic 416), PAT 20 Cr. Telephony cost was 212 Cr (44% of costs) and advertising 12.5 Cr. | Entrackr, citing RoC | 2026-01-21 | read-secondary | medium-high |
| Exotel ships a GenAI voicebot (Hindi, English, Hinglish) and AgentStream bring-your-own-bot streaming. Agora integrated on 2025-10-15. | exotel.com; Voice&Data; PR Newswire | 2025-10 / 2026-10-17 | read-primary / secondary | medium-high |
| A long-time Exotel IVR customer reported getting no AI-voice-agent demo after a week of follow-ups. | Trustpilot review | 2026-04-23 | read-primary (n=1) | low (anecdote) |
| Ozonetel has channel (Master Agent, Reseller, VAR), referral and strategic-alliance programmes. It claims "over 2,500 customers" in the body text and "3500+" in the navigation. ElevenLabs Agents run on Ozonetel SIP trunks and DIDs. | ozonetel.com partner page; elevenlabs.io | 2026-10-17 | read-primary | medium |
| Gupshup: FY26 about $350M and profitable (CEO), with AI about 25% of revenue. India entity FY25 INR 1,943 Cr (from 2,051), PAT 26 Cr. Self-serve voice AI from $0.035 a minute. Fidelity marked the company at $278M in January 2026. | Inc42 feature | 2026-09-23 | read-secondary | medium |
| Gupshup's WhatsApp fee is $0.001 per message, with Meta charges at actuals. Meta charges for service messages from 2026-10-01, and business-initiated WhatsApp calls are priced per minute. | gupshup.io/pricing | 2026-10-17 | read-primary | high |
| AiSensy plans run from free to INR 45,000 a month. Its WhatsApp AI agent costs INR 1,350 a month per 1,000 AI messages. India per-message rates are marketing INR 1.09 and utility INR 0.145, against Meta's 0.8631 and 0.115, a 26% markup. | aisensy.com/pricing; l1 whatsapp-india-rates.csv | 2026-10-01 rates | read-primary, computed | high |
| AiSensy affiliate partners earn 20% recurring for the customer's lifetime. It claims 5,000+ active partners and 150,000+ brands; the pricing page says "2.3L+ businesses". | AiSensy partner blog; pricing page | 2025-01-16 / 2026-10-17 | vendor-claim | medium |
| Interakt's WhatsApp Voice Calling needs explicit user permission: temporary permission lasts 7 days, at most 2 requests per 7 days, permission is revoked after 4 unanswered calls, and the cap is 100 connected calls per 24 h per number. It needs the Advanced or Sales CRM plan. It is human calling with AI transcripts, not an AI caller. | interakt.shop resource centre | 2026-04-14 | read-primary | high |
| Tata Communications and TTBS sell an AI voice agent on a dedicated business number through TTBS's channel partners and digital marketplace, targeting 60M+ SMBs. | CRN Asia; NewsBytes | 2026-07-28 | read-secondary | medium |
| MyOperator AI Agent Voice costs INR 10,000 a month including 2,000 minutes, billed annually plus GST. | l4a pricing-history.json (Common Crawl 2026-06-17) | 2026-06-17 | read-primary (via l4a) | high |

### 3b. H8: context, adoption and switching

| Claim | Source | Date | Method | Confidence |
|---|---|---|---|---|
| Goal-specific reminders raised saving 16% against no reminder; generic reminders had no significant effect. | Karlan, McConnell, Mullainathan and Zinman (NBER w16205 / Management Science) | 2010 / 2016 | read-secondary (summaries) | medium-high |
| SMS repayment reminders worked only with the loan officer's name, and only for repeat clients. | Karlan, Morten and Zinman, NBER w17952 | 2012-03 | read-primary (abstract) | high |
| The recipient's name in an email subject raised opens 20% and sales leads 31%, and cut unsubscribes 17%. | Sahni, Wheeler and Chintagunta, Stanford GSB WP 3409 | 2016-10 | read-primary (abstract) | high |
| Speaking with a bank agent raised timely repayment 34.4pp (LATE; ATE about half), cut default 23.8pp, and voice likeability mattered (n = 3,448). | Laudenbach, Pirschel and Siegel (CESifo WP 7295; JF 2025) | 2021-10 / 2025 | read-primary (paper) | high |
| An AI assistant raised support agents' resolutions per hour by about 15% (n = 5,172). | Brynjolfsson, Li and Raymond (QJE 2025) | 2025 | read-secondary | medium-high |
| Alliance Insurance Brokers moved from Zoho to LeadSquared because they were "unable to customize insurance workflows and automation" and lacked integrations. They report 60% higher agent productivity and 25% more conversions (vendor). | LeadSquared case study | undated (2026 page) | vendor-claim | medium (reason), low (numbers) |
| Universal Sompo kept renewal data in Excel; after LeadSquared mobile CRM, its renewal ratio rose 10% in 6 months (vendor). | LeadSquared case study | engagement 2018 | vendor-claim | low-medium |
| Ringg: early outbound, lead-qualification and collection use cases "are not sticky, … always going to be a price game". It moved to complex workflows such as clinic booking and KYC. | TechCrunch | 2026-08-25 | read-secondary (direct quote) | high |
| SquadStack charges a base fee plus a success fee per disbursal, card or renewal, and says "Two rupees a minute is a trap". Its claimed lift comes from parallel experiments on timing, language and framing. | CXOToday launch coverage | 2026-09-14 | vendor-claim | medium |

### 3c. H10: distribution, terms and cost to acquire

| Claim | Source | Date | Method | Confidence |
|---|---|---|---|---|
| Bolna: 75% of revenue is self-serve, ARR near $700k, pilots rose from $100 to $500, and enterprise deals use forward-deployed engineers. | TechCrunch | 2026-01-20 | read-secondary | high |
| ARPA computed from filings and claims: Bolna ~4.9k, Ozonetel ~26–37k, Exotel ≤ ~49.5k, Gupshup ≤ ~51k, LeadSquared ~1.7L and Gnani ~2.2–2.4L INR a month. | data/arpa.csv | 2026-10-17 | computed | medium (claims are floors) |
| RBI E-mandate Framework 2026: recurring debits are AFA-free up to INR 15,000 (INR 1 lakh only for insurance premiums, mutual funds and credit-card bills), with 24 h pre-debit notice, covering cards, PPIs and UPI. | rbi.org.in Master Direction | 2026-04-21 | read-primary | high |
| Annual prepay discounts are 38% (Zoho CRM Standard) and 28% (Zoho One). Kylas, Interakt and Knowlarity have no monthly plan. | Zoho JSON; vendor pages | 2026-10-17 | read-primary, computed | high |
| Shopify keeps nothing on the first $1M of app revenue, 15% above that, plus a 2.9% processing fee. Whether the $1M is lifetime (news, mid-2025) or annual is not stated on the help page. | help.shopify.com; Business Insider/TechCrunch coverage | 2026-10-17 | read-primary / secondary | medium-high |
| Zoho Marketplace: free to list, the developer sets the price, and payouts are monthly once $100 or more has accrued. On 2026-10-17 searches returned "telephony" 737 results, "whatsapp" 118, "voice agent" 71 and "ai calling" 31. | zoho.com developer FAQ; marketplace.zoho.com | 2026-10-17 | read-primary, measured | medium-high |
| Vobiz (telephony for AI voice) gets about 70% of revenue from AI voice startups, serves Sarvam, Bolna and Smallest.ai, and offers self-serve KYC and number provisioning. | Inc42 | 2026-06-06 | read-secondary | medium |
| Turtlemint has 550,000+ registered PoSPs and 46 insurers. | NSE filing (via search snippet) | 2026-09-01 | read-secondary | medium |
| CommandCentre's cold email to Indian SMB exporters: 8,784 sends, 88 replies (1.0%), 21 positive, 3 meetings, 0 won. Different ICP. | docs/harvest/cc-main.md, cc-branches.md | 2026-09-04 | measured by us (inherited) | high (mechanics), low (transfer) |
| Coded incumbent complaints (n = 111 one- and two-star Trustpilot reviews across 11 vendors): support 76 (68%), billing, refund or cancellation 30 (27%), implementation or setup delay 26 (23%), misselling 20 (18%), integration 19 (17%), WhatsApp or Meta account 14, pricing 14. | data/incumbent-complaint-summary.csv | reviews 2019–2026 | measured (regex-coded, read) | medium (self-selected sample) |

---

## 4. Measurements (ours)

| ID | What | n | Method | Date | Result |
|---|---|---|---|---|---|
| M1 | Zoho INR list prices | 158 price sets across 5 JSON files | Downloaded Zoho's own price JSON from zohowebstatic.com, found while sniffing the pricing page's network calls, and parsed the INR column (`code/zoho_prices.py`) | 2026-10-17 | `data/zoho-inr-prices.csv`. India prices run about 30–40% below USD at INR 88. Annual prepay saves 20–38%. |
| M2 | Incumbent complaint taxonomy | 296 Trustpilot reviews scraped (sorted by recency, up to 3 pages per vendor, 12 vendors with reviews); 111 at two stars or fewer coded | Playwright read `__NEXT_DATA__`; regex rules in `code/code_complaints.py`; every low-star review read by hand | 2026-10-17 | Support dominates for every vendor. Refund refusals on prepaid credits and plans recur (AiSensy, Interakt, WATI). WATI's WhatsApp-calling audio failed for one customer. |
| M3 | Zoho Marketplace crowding | 5 search queries | Playwright render of marketplace.zoho.com search | 2026-10-17 | telephony 737, whatsapp 118, voice agent 71, ai calling 31, exotel 7 (counts include the same app listed under several Zoho products) |
| M4 | Revenue per customer | 10 vendors | `code/arpa.py`: revenue ÷ claimed customers ÷ 12 | 2026-10-17 | Table in section 1. Spans about 50× from self-serve (~INR 4.9k) to enterprise voice AI (~INR 2.3L). |
| M5 | WhatsApp BSP markup | 2 rates | AiSensy price ÷ Meta India rate (l1) | 2026-10-17 | +26.3% marketing, +26.1% utility |

Limits:
- M2 is not a rate. Trustpilot over-represents angry users and non-Indian users, and Bigin and LeadSquared score well (4.8 and 4.6).
- M4 uses customer counts that are marketing floors and revenue that includes overseas income, so its values are upper or lower bounds as marked.

---

## 5. Gaps in the market

1. **No Indic, context-aware calling agent that plugs into a horizontal SMB CRM.** Zoho (1M+ customers), Kylas (13k claimed), Bitrix24 and Freshworks have none we could find. LeadSquared and Sell.Do now bundle their own. Zoho's MCP server, free agent builder and Hindi ASR mean this gap may close within 6–12 months.
2. **Service is the incumbents' weak point, not features.** 68% of coded complaints are about support. Refund disputes over prepaid credits are frequent. A long-time Exotel customer could not get an AI-voice demo for a week. A white-glove, outcome-accountable service is a real gap for mid-market buyers.
3. **Insurance intermediaries are thinly served.** l3 counts about 2,500 IRDAI-registered intermediaries. Their renewal data lives in spreadsheets (LeadSquared and Universal Sompo case; l3). SquadStack and Gnani sell to insurers, not to brokers or IMFs. The enterprise CRMs (Salesforce, LeadSquared) are priced and sold for larger organisations.
4. **WhatsApp calling plus an AI caller.** BSPs ship WhatsApp text agents and human WhatsApp calling (Interakt, WATI), and Gupshup prices business-initiated WhatsApp calls. None ships an AI voice agent on WhatsApp calls. Meta's permission rules cap volume: 7-day temporary permission, 100 connected calls per day per number, 2 requests per 7 days. That fits consented service calls such as renewals, not campaigns. l1 should judge how TRAI rules apply.
5. **Outcome pricing below enterprise.** SquadStack's per-outcome fee is live for BFSI enterprises only. Mid-market vendors price per minute (INR 3–6) or per seat. No vendor we found offers a per-renewal-saved fee to a broker.
6. **Payments friction above INR 15k a month.** Because of the e-mandate cap, a mid-market ticket cannot sit on frictionless UPI or card auto-debit. Invoice and NEFT on annual or quarterly prepay with GST and TDS handling is the norm, and that requires sales-led billing operations.

---

## 6. What would kill this

| Recommendation | Kill criterion (written now) |
|---|---|
| Wedge-first, plug-in voice agent (not a suite) | If at least 5 of the first 15 qualified beachhead interviews say they would only buy voice as part of a replacement CRM or campaign system, or that they need VP to hold their customer records, revisit H8. Also revisit if two or more discovery prospects ask to replace their CRM in the first meeting. |
| Context-aware calls are worth building in from day one | If a concierge A/B on one buyer's renewal list (context-rich script vs a generic script, same voice) shows no lift in renewals saved, with the sample sizes from H7's power analysis, drop deep-context work from the MVP. |
| Insurance intermediaries reached by founder-led direct sales | Kill if, after 60 targeted intermediaries (l3 list), fewer than 10 take a discovery call or fewer than 3 accept a paid pilot at the stated price within 10 weeks. |
| CPaaS as infrastructure, not as a channel | Revisit if any CPaaS (Exotel, Ozonetel, MyOperator) offers a co-sell or reseller agreement with real margin and a named account list. That would make it a channel, and this report would be wrong about the conflict. |
| Shopify App Store as the D2C alternate's channel | Kill if the median paying merchant after 90 days pays under INR 5,000 a month, matching Bolna's self-serve ARPA. |
| Zoho or LeadSquared integration first | Do not build a connector until 2 paying customers need it. If Zoho ships a native Indic calling agent at near-zero price, deprioritise the Zoho Marketplace entirely. |

---

## 7. Owner actions

None of these were done by the research. Each needs the owner.

1. **Discovery interviews: 15 insurance intermediaries** (brokers, corporate agents, IMFs) from the IRDAI registers that l3 identified. Ask about past behaviour:
   - Where does the renewal list live (Excel, LeadSquared, Zoho, an insurer portal)?
   - How was the last CRM or dialler bought? Who signed, how long did it take, and on what payment terms (annual prepay, quarterly)?
   - Did they ever change CRM, and why?
   - What does a saved renewal earn them?

   Then ask a Van Westendorp price question, per renewal saved and per minute. Record whether any of them would let a vendor hold their customer records (the H8 test).
2. **Exotel AgentStream and Ozonetel BYO-bot terms.** Request partner or developer documentation and commercial terms with an anonymous enquiry or by calling sales. Ask:
   - Can a third-party bot run on a customer's 1600-series number?
   - What is the per-minute streaming price?
   - Is there any referral or co-sell?

   This needs a phone call and possibly sign-up with OTP.
3. **Zoho Marketplace developer agreement.** Sign up for a Zoho developer account (needs phone OTP) and read the revenue-share clause, which is not public.
4. **AiSensy, WATI and Interakt partner terms.** Ask each partner desk for white-label wholesale rates and whether a voice add-on could be listed. These are sales conversations.
5. **Turtlemint (or RenewBuy / InsuranceDekho) BD intro** for a renewal-call pilot on PoSP books. This is a warm-intro task; do not cold-pitch until the intermediary interviews are done.
6. **Ask a CA one question:** for a domestic SaaS subscription at INR 1 lakh a month, do buyers withhold TDS at 2% (194J, technical services) or 10%? The answer changes cash collected per invoice.

---

## 8. Open questions

- **Zoho One "24% on day one".** Is the denominator Zoho One customers or all new Zoho customers? If it is the latter, a quarter of new Zoho customers buy the whole suite immediately. That would weaken (not reverse) the point-first finding. The page does not say.
- **What do Indian mid-market buyers actually pay for voice AI?** No customer invoice was available to us. l4b should add invoices from its measured runs.
- **How fast will Zoho ship a calling agent?** The building blocks were announced on 2025-07-17 (Hindi ASR, agents, MCP). If Zoho bundles voice into Zia Agents at its token prices, the plug-in-to-Zoho channel shrinks.
- **India SMB churn and CAC.** No primary data was found. The only figures are consultancy estimates (CAC $80–250, payback 18–36 months), which are cross-checks only and unverified.
- **AiSensy, Kylas, WATI and LimeChat revenues** are unverified. Tofler returned 403, and aggregator figures conflict.
- **Exotel, Knowlarity and Ozonetel current price lists** were blocked or geo-gated (`data/blocked-sources.csv`). l4a's Common Crawl history covers Exotel only up to 2024 prices.
- **The legal status of WhatsApp business-initiated AI calls under TRAI TCCCPR** belongs to l1. If they are treated as outside telecom commercial communication, gap 4 becomes much larger.
