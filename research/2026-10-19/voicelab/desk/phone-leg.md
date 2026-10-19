# Phone leg for test-calling the voice agent from an Indian mobile — desk research

**Date:** 2026-10-19. Web-only desk research: no sign-ups, no spend.
**Setup:** The agent server runs on an Azure VM in Central India (Pune) and speaks PCM over a WebSocket. The founder wants to call the agent from their own Indian mobile, and have it call them back, this week.
**Labels used below:**
- **[primary]** means read on the vendor's or regulator's own page on 2026-10-19.
- **[secondary]** means a third-party page.
- **[unverified]** means I could not confirm it from a primary source.
- **[estimate]** means my own reasoning, not measured.

---

## 0. Bottom line

| Goal | Pick | Why | Realistic time to first call |
|---|---|---|---|
| **Fastest, if you have no registered business** | **Vobiz** (Indian CPaaS, Mumbai media) | The only Indian provider found with **individual** e-KYC (Aadhaar + PAN), claimed at about 2 minutes. Self-serve. Bidirectional WebSocket with L16 at 8/16 kHz in and up to 24 kHz out. | Same day, if e-KYC goes through as documented |
| **Fastest, if you have GST, COI or Udyam** | **Plivo (India data region)** | KYC for 080/022 numbers is automated, "typically within 5 minutes". Mature docs. Bidirectional `<Stream>`. | Same day |
| **Cheapest** | **Plivo India** | ₹0.38/min inbound and outbound, ₹200/month number, audio streaming included, 30-second pulse. | — |
| **Best for a later production pilot** | **Plivo India**, with **Exotel** or **Vobiz** as a second source | Cheapest published INR rate, automated KYC, documented TRAI media-anchoring and number-series handling, LiveKit/Pipecat ecosystem. Exotel is the Indian incumbent but its streaming is sales-gated and priced separately. | — |
| **Zero-KYC fallback** | **Twilio paid (upgraded) account + US number**. *Not* a trial account. | Twilio trials **block `<Stream>`**. Calls to Indian mobiles must use a non-Indian caller ID and are allowed. You pay an international-routing latency penalty (no Indian edge), get 8 kHz μ-law only, and there was a recent Jio failure incident. | Same day, but not representative of production |

**The one-line answer:** If you have any Indian business registration (GST, COI or Udyam), use **Plivo India**. If you are signing up as an individual, use **Vobiz**. Either one can plausibly carry a call both ways to your mobile today, with media staying inside India (Mumbai to Pune). Use Twilio only if both KYC routes fail, and treat its latency as a worst case, not as your product's latency.

---

## 1. Facts that shape every option

1. **Domestic Indian routes require an India-registered entity, KYC, an Indian caller ID and media kept in India.**
   - Plivo [primary]: "Only businesses registered in India can: rent Indian numbers, make domestic calls within India…". It also says "Both legs of a call must originate and terminate within India". Violations fail with `violates_media_anchoring` / hangup 4590. Sources: [Plivo India calling](https://www.plivo.com/docs/voice/concepts/india-calling.md) and [Plivo calling-in-India for voice agents](https://www.plivo.com/docs/voice-agents/sip-trunking/deploy/calling-in-india.md). The second page says: "TRAI regulations require voice traffic for India calls to be anchored on servers located in India."
   - Vobiz states the same rules [primary]: [Vobiz India calling regulations](https://www.vobiz.ai/docs/compliance/india/calling-regulations) and [Vobiz domestic calling FAQ](https://www.vobiz.ai/docs/faq/domestic-calling-india).
   - **Your Pune VM satisfies this.** Azure Central India is Pune ([Azure announcement](https://azure.microsoft.com/en-us/updates/azure-available-in-india-regions)). Do not move the WebSocket server outside India for domestic routes.
2. **You cannot use your own mobile number as the agent's caller ID on Indian routes.**
   - Plivo [primary]: "Verified Caller ID: Not supported. All outbound calls from India must use a Plivo-rented Indian number as the caller ID." ([Plivo numbers](https://www.plivo.com/docs/numbers.md)).
3. **International calls that show an Indian (+91) caller ID are blocked at carrier level.**
   - DoT and the operators' "International Incoming Spoofed Calls Prevention System" has been live since 22 Oct 2024 ([All India Radio / NewsOnAir](https://www.newsonair.gov.in/international-incoming-spoofed-calls-prevention-system-launched)).
   - DoT also asked operators to label calls from abroad as "International Call" [secondary: [Voice&Data](https://www.voicendata.com/news/dot-takes-measures-to-combat-spoofed-international-calls-8657268), [TelecomTalk](https://telecomtalk.info/?p=982597)]. Rollout status per operator in 2026 is [unverified].
   - Consequence: any foreign CPaaS that calls your mobile must present a **foreign** caller ID, such as +1.
4. **The phone leg is effectively narrowband.**
   - Twilio Media Streams is fixed at 8 kHz μ-law [primary].
   - The Indian providers accept 16/24 kHz from your server, but the PSTN interconnect to a mobile is normally G.711 at 8 kHz [estimate — general telephony practice, not confirmed per carrier].
   - **Judge the TTS voice as it sounds at 8 kHz.** Sending 16/24 kHz mainly spares you a resampling step, because the provider downsamples anyway.

---

## 2. Candidate-by-candidate

### 2.1 Plivo — India data region (recommended if you have a registration)

| | |
|---|---|
| **Indian number / outbound** | Rent **landline-series 080/022** DIDs (service and transactional use; "Promotional content is strictly prohibited"). Outbound to any Indian destination from that number. Other series: **140** for promotional only; **160** for BFSI only. Both need extra setup. [primary: [rent-india-numbers](https://www.plivo.com/docs/numbers/rent-india-numbers.md), [india-calling](https://www.plivo.com/docs/voice/concepts/india-calling.md)] |
| **Account constraints** | Indian numbers are "only available to India data region organizations". The region cannot be changed later; you can add an India org under the same login. India-region accounts take **Indian-issued cards only**. [primary: [account FAQ](https://www.plivo.com/docs/faq/account/account-management.md)] |
| **KYC** | Submit **any one** of: GST certificate (active GSTIN), Certificate of Incorporation (CIN), or **Udyam Registration Certificate**. "Business PAN alone is not accepted." The first application must be **sealed and signed by an authorized signatory**. Review for 080/022 is "automated — you receive an acceptance or rejection typically within 5 minutes". [primary: [rent-india-numbers](https://www.plivo.com/docs/numbers/rent-india-numbers.md)] |
| **KYC doc conflict** | Older Plivo FAQ and search snippets say "registration certificate AND PAN/GST" and "15 min to 1 business day". The current page is the one quoted above. |
| **No company? (Udyam)** | Udyam (MSME) registration is "Free of Cost and paperless", "No documents or proof are required to be uploaded", and "a certificate will be issued online" [primary: [udyamregistration.gov.in](https://udyamregistration.gov.in/)]. This is only legitimate if you actually run an enterprise, such as a proprietorship. It is a self-declaration. |
| **Trial** | The pricing page says "Get $10 in free credits. No credit card required." [primary: [pricing/in](https://www.plivo.com/voice/pricing/in/)]. Trial calls go only to verified "sandbox" numbers [secondary]. Whether the $10 applies to India-region orgs is [unverified]. In practice you KYC and rent a number anyway. |
| **Streaming** | `<Stream bidirectional="true">` in Answer-URL XML. Inbound `contentType` options: `audio/x-mulaw;rate=8000` (default and "lowest latency"), `audio/x-l16;rate=8000`, `audio/x-l16;rate=16000`. The XML reference also lists `audio/x-l16;rate=24000`. You send `playAudio`, `checkpoint` and `clearAudio`; Plivo sends `start`, `media`, `dtmf`, `playedStream` and `clearedAudio`. `keepCallAlive`; `streamTimeout` defaults to 86400 s. [primary: [audio-streaming guide](https://www.plivo.com/docs/voice-agents/audio-streaming/concepts/audio-streaming-guide.md), [Stream XML](https://www.plivo.com/docs/voice/xml/audio-streaming.md)] |
| **Not documented** | Which playback sample rates `playAudio` accepts beyond the 8 kHz example. |
| **Latency** | Plivo routes "through the edge location closest to the caller". The India region anchors in Mumbai, and Mumbai to Pune is short [estimate]. Plivo gives no streaming-latency figure. |
| **Price** | **₹0.38/min outbound and ₹0.38/min inbound** (domestic). "Pulse is 30 seconds." **Audio streaming: Included.** Domestic number **₹200.00/month**. WebRTC/SIP ₹0.25/min. Noise cancellation ₹0.12/min. [primary: [plivo.com/voice/pricing/in](https://www.plivo.com/voice/pricing/in/), fetched 2026-10-19] |
| **Other price figures seen** | Search snippets showed ₹0.60/min and ₹250/month, and a devplivo page showed ₹0.40/min. These are older or other tiers. GST on top is [unverified for Plivo; standard 18% on Indian invoices]. |
| **TRAI fit** | Landline series is correct for non-promotional calls. A test call to yourself is not commercial communication. |

### 2.2 Vobiz (ilaimitado Pvt Ltd, Bengaluru) — fastest for an individual

| | |
|---|---|
| **Indian number / outbound** | India DIDs. The regulations page lists **"91 series – Standard mobile series for personal and business use – Available"**, plus landline series, 140 (promotional, outbound-only, TATA DLT required) and 160 (BFSI). Outbound must use a Vobiz India number as caller ID. Media must stay in India. [primary: [calling-regulations](https://www.vobiz.ai/docs/compliance/india/calling-regulations), [140/160 acquisition](https://www.vobiz.ai/docs/best-practices/140-160-acquisition), [domestic-calling FAQ](https://www.vobiz.ai/docs/faq/domestic-calling-india)] |
| **KYC** | "Fully automated and takes less than 2 minutes." **Individual: Aadhaar e-KYC + PAN verification** ("Perfect for personal use, startups, or individual business owners"). **Company: PAN + GST** (real-time GSTN lookup). [primary: [India Number KYC](https://vobiz.ai/docs/compliance/india/kyc)] |
| **Conflict in Vobiz's own docs** | The [calling-regulations](https://www.vobiz.ai/docs/compliance/india/calling-regulations) page says "Only businesses registered in India can rent Indian phone numbers". The KYC page and the FAQ ("Aadhaar/PAN for individuals") say otherwise. **Confirm at signup [unverified which applies].** |
| **Trial** | "₹25 starter credit" [primary: [platform/login](https://www.vobiz.ai/docs/platform/login)]. **Trial numbers are outbound-only.** Inbound needs completed KYC, a payment method and a purchased DID [primary: [trial-inbound FAQ](https://www.vobiz.ai/docs/faq/trial-inbound)]. Whether trial outbound is limited to verified numbers is [unverified]. |
| **Streaming** | `<Stream bidirectional="true">` from XML, or a Start Stream REST call. **Inbound:** `audio/x-l16;rate=8000` (default), `audio/x-l16;rate=16000`, `audio/x-mulaw;rate=8000`. **Outbound `playAudio`:** L16 at 8/16/**24 kHz** or μ-law at 8 kHz. 24 kHz is valid for playback only. JSON frames with base64 payloads, **wss:// required**. Events: `start`, `media`, `playedStream`, `clearedAudio` in; `playAudio`, `checkpoint`, `clearAudio`, `stop` out. `maxRetries` reconnect (max 10). `keepCallAlive`. [primary: [Stream XML](https://www.vobiz.ai/docs/xml/stream), [Audio Streams API](https://www.vobiz.ai/docs/audio-streams)] |
| **Hosting** | Infra region `ap-south-1` with origination region `mumbai` (CDR examples) [primary: [CDR docs](https://www.vobiz.ai/docs/cdr)]. Firewall: allow their listed ranges on TCP 443 to your WebSocket server [primary: [IP whitelisting](https://www.vobiz.ai/docs/concepts/ip-whitelisting)]. |
| **Latency claim** | "Sub-80 ms" telephony latency. **Vendor claim, not measured.** |
| **Price** | Their docs give **₹0.65/min both ways on the WebSocket path, ₹0.45/min on the SIP path, ₹500/month per DID** [primary docs: [SIP vs WebSockets](https://www.vobiz.ai/docs/concepts/sip-vs-websockets)]. Other Vobiz pages say "flat ₹0.65/min" or "₹0.45/min". The US price page lists "WebSocket Streaming $0.0034/min/stream" and "a one-time setup fee equal to one month's rental" [primary: [pricing/voice](https://www.vobiz.ai/pricing/voice)]. **The India tab of the price page is rendered client-side and I could not read it, so treat India prices as [unverified until shown in console].** |
| **Maturity** | Young company. A $1M seed was reported [secondary: [Munich Startup](https://insights.munich-startup.de/news/feed/telephony-infrastructure-startup-vobiz-ai-raises-1m-led-by-piper-serica)]. Docs are extensive, and the API is Plivo-style (XML, answer_url). |

### 2.3 Exotel — Indian incumbent; streaming is gated

| | |
|---|---|
| **Indian number / outbound** | ExoPhones: **local DID (080-XXXX-XXXX)**, **mobile (9XXX-XXX-XXX)** and **toll-free 1800** (inbound only). Local and mobile support outbound. [primary: [ExoPhone setup](https://developer.exotel.com/docs/getting-started/exophone-setup), [number types FAQ](https://developer.exotel.com/docs/faqs/number-types)] |
| **KYC** | **Sole proprietorship:** GST certificate or Shop & Establishment licence, PAN, proprietor ID. **Pvt Ltd/LLP:** COI, PAN, GST, director ID. There is **no individual (non-business) category**. Takes **1–3 business days**, "up to 5 business days if documents require manual review". [primary: [KYC verification](https://developer.exotel.com/docs/getting-started/kyc-verification), [account-setup FAQ](https://developer.exotel.com/docs/faqs/account-setup)] |
| **Trial** | Trial page: "7 days", whitelist **up to 10 numbers**, "Calls only to verified (whitelisted) numbers", one auto-assigned trial ExoPhone [primary: [trial account](https://developer.exotel.com/docs/getting-started/trial-account)]. The pricing page says "500 free credits" [primary: [pricing](https://exotel.com/pricing/business-phone-system/)]. **Conflict:** the pricing FAQ says trial credits "expire after 15 days" ([pricing FAQ](https://developer.exotel.com/docs/faqs/pricing-plans)). |
| **Streaming gate** | **"AgentStream access requires completion of your KYC verification."** You enable it by emailing hello@exotel.com with subject "Enable Stream/Voicebot Applet for [Account SID]" [primary: [support quick guide](https://support.exotel.com/support/solutions/articles/3000132268-quick-guide-to-get-started-with-exotel-streaming-services)]. **So the trial does not get you a streaming call.** |
| **Streaming** | The **Voicebot applet is bidirectional**; the Stream applet is one-way. "raw/slin (16-bit, 8kHz, mono PCM little-endian) encoded in base64". `?sample-rate=16000` or `24000` is supported. **Chunks: min 3.2 KB (100 ms), max 100 KB, multiples of 320 bytes.** Events from Exotel: `connected`, `start`, `media`, `dtmf`, `stop`, `mark`. Events to Exotel: `media`, `mark`, `clear`. [primary: [Stream & Voicebot applet](https://developer.exotel.com/docs/agentstream/stream-voicebot-applet)] |
| **Outbound with streaming** | The Connect API takes `StreamUrl` + `StreamType=bidirectional` [primary: [AgentStream getting started](https://developer.exotel.com/docs/agentstream/getting-started)]. The newer "Connect Voice AI API" (24 May 2026) dials a number and opens the stream in one POST, but "must be enabled on your account" [primary: [Exotel build post](https://exotel.com/build/one-api-call-your-ai-bot-is-on-the-phone/)]. |
| **Region** | Use the **Mumbai** instance (`api.in.exotel.com`). The default for most accounts is Singapore [primary: support quick guide and build post]. |
| **Latency** | Exotel's blog claims "<50 ms" in one place and "<20 ms" in another [primary, self-inconsistent: [migration blog, 19 Feb 2026](https://exotel.com/blog/migrate-twilio-to-exotel-voice-ai-india/)]. **The 100 ms minimum chunk is a real buffering floor on playback granularity.** |
| **Limits** | 60-minute session cap and 10-second bot timeout appear in search snippets; the source page now returns 404 [unverified]. |
| **Price** | Plans: Dabbler **₹9,999 / 5 months** (1 ExoPhone, 5,000 credits), Believer ₹19,999 / 11 months, Influencer ₹49,499 / 11 months. 1 credit = ₹1. **"Voice Streaming (Agent Stream) is excluded from the plans … available as a separate offering"**, priced via hello@exotel.com [primary: [pricing](https://exotel.com/pricing/business-phone-system/)]. Per-minute rates are not published. Exotel's own blog cites ~₹0.80–1.00/min out and ₹0.30–0.50/min in [secondary figures quoted on primary blog]. ExoPhone rental ~₹500–1,000/month [unverified; docs page now 404]. 18% GST [primary: pricing FAQ]. |
| **Verdict** | Good production candidate, but **not this week's fastest path**: KYC takes days, streaming is enabled by email, and price comes from sales. |

### 2.4 Twilio — zero-KYC fallback only (and only on a paid account)

| | |
|---|---|
| **Indian number** | No usable Indian DID for an Indian customer. India's regulatory page lists only toll-free +91800, with an address "outside of the country" [primary: [Twilio IN regulatory](https://www.twilio.com/en-us/guidelines/in/regulatory)]. |
| **Calling Indian mobiles** | **"Outbound calls to India can only be made from international (non-Indian) numbers."** [primary: [Twilio IN voice guidelines](https://www.twilio.com/en-us/guidelines/in/voice)]. So use a US number as caller ID. Allowed in 2026. Your phone may label it international or spam [unverified per operator]. |
| **Trial** | 30 days, 75 voice minutes, up to 5 verified recipients, "You can only make calls within your country". **10-minute per-call cap.** **`<Stream>`, `<ConversationRelay>`, `<Record>`, `<Dial><Number>` and `<Dial><Sip>` are stripped on trial** ("The {verb} verb is not available on trial accounts") [primary: [trials](https://www.twilio.com/docs/usage/trials), [try-out-voice](https://www.twilio.com/docs/usage/trials/try-out-voice)]. **A trial cannot test Media Streams at all. You must upgrade** (profile, address, starting balance, payment method). |
| **Streaming** | Bidirectional only with `<Connect><Stream>`. **Both directions are fixed at `audio/x-mulaw`, 8000 Hz, mono**, base64 [primary: [Media Streams WebSocket messages](https://www.twilio.com/docs/voice/media-streams/websocket-messages)]. |
| **Price** | To Indian mobile **$0.0496/min**; India landline $0.0699/min; Media Streams **$0.0044/min** [primary: [pricing/in](https://www.twilio.com/en-us/voice/pricing/in)]. US local number **$1.15/month**; inbound to a US local number **$0.0085/min** [primary: [pricing/us](https://www.twilio.com/en-us/voice/pricing/us), "current as of August 2026"]. If you dial in, you also pay your own operator's ISD rate to the US [unverified]. |
| **Reliability flag** | Twilio status reported **"Voice Call Failures from Twilio Phone Numbers to Reliance Jio India"** from 17 Jul to 6 Aug 2026. It was scoped at one point to Andhra Pradesh, **Maharashtra & Goa**, Tamil Nadu and Karnataka. It was closed as "considered resolved" with "Impacted customers will be contacted individually", and **no fix was stated** [primary: [status incident](https://status.twilio.com/incidents/220yx5739dhm)]. **If your mobile is on Jio in Maharashtra, expect possible failures.** |
| **Latency penalty** | Twilio lists **no India edge or region**. The nearest edge is Singapore, and the processing region defaults to US1 [primary: [edge locations](https://www.twilio.com/docs/global-infrastructure/edge-locations)]. The media path is: Indian mobile → international carrier → Twilio (outside India) → WebSocket to Pune → back. **[estimate]** That adds roughly 150–300 ms of round trip compared with a Mumbai-anchored domestic provider, on top of international PSTN carriage, and narrowband μ-law. It is fine for checking whether the voice sounds right, but misleading for turn-taking feel. |

### 2.5 Telnyx

| | |
|---|---|
| **Indian number** | **Mobile numbers in India since 17 Sep 2026**, only in **Mumbai City, Gurugram, Noida and Bangalore**. "Businesses must provide a valid business or residential address within one of the four authorized telecom districts" and complete KYC. Calling is limited to within India. [primary: [release note](https://telnyx.com/release-notes/india-local-voice-numbers)] **Pune is not one of the four districts.** |
| **India DID documents** | **Personal:** name + "Company Link (Approved Company Group UUID)" + end-user verification link. **Business:** COI, GST, company PAN, MoA/AoA, power of attorney, board resolution, India service-area PIN, signatory verification [primary: [Telnyx India DID requirements](https://support.telnyx.com/en/articles/3739465-india-did-requirements)]. Activation time [unverified]. |
| **Trial** | **$5** credit. "Limited to 1 verified number". Outbound only to that number. **10 minutes per call**, 2 concurrent. "1 local number of the account's country of origin per trial account lifetime" [primary: [trial levels](https://developers.telnyx.com/docs/account-setup/levels-and-capabilities/trial.md)]. International calling needs a higher account level (payment method and company name) [secondary snippet of Telnyx docs]. |
| **Streaming** | Bidirectional RTP-over-WebSocket. Codecs: **PCMU/PCMA/G722 (8 kHz), OPUS and AMR-WB (8/16 kHz), L16 (16 kHz)**. Chunks of 20 ms to 30 s. `mark` and `clear` events [primary: [media streaming](https://developers.telnyx.com/docs/voice/programmable-voice/media-streaming)]. |
| **Price** | Media streaming **$0.0035/min** [primary: [call-control pricing](https://telnyx.com/pricing/call-control/in)]. India per-minute and number prices [unverified — not on the public pages]. |
| **Verdict** | Not this week's path for a Pune-based founder. |

### 2.6 Vonage

- **Indian numbers:** Not self-serve. They are available by request only, and **"these numbers are for inbound only"** [primary: [Vonage India voice features](https://api.support.vonage.com/hc/en-us/articles/20053288510620-India-Voice-Features-and-Restrictions), updated 2026-03-13].
- **Caller ID:** "Calls from International numbers are supported." "Domestic calls from Local CLI is not supported."
- **WebSocket:** `audio/l16;rate=8000|16000|24000`, binary frames of about 20 ms, `clear` and `notify` commands, and a buffer of about 60 s [primary: [Vonage WebSockets](https://developer.vonage.com/en/voice/voice-api/concepts/websockets)].
- **Pricing for calls to India:** [unverified].
- **Verdict:** A technically nice 16 kHz socket, but it is an international-route option like Twilio.

### 2.7 Azure Communication Services (ACS)

- **India is not in ACS's phone-number country list.** "If your Azure billing address is outside of the United States, you are not eligible to acquire trial phone numbers." [primary: [ACS number eligibility](https://learn.microsoft.com/en-us/azure/communication-services/concepts/numbers/sub-eligibility-number-capability), updated 2026-09-23].
- **Streaming:** Call Automation bidirectional streaming is GA, with 16 kHz or 24 kHz PCM mono [secondary: Microsoft Tech Community posts; overview at [ACS media streaming](https://learn.microsoft.com/en-us/azure/communication-services/concepts/voice-video-calling/media-streaming)].
- **Direct Routing** would need a certified SBC plus an Indian carrier SIP trunk with media anchored in India. That takes weeks, not days [estimate].
- **Not viable this week.** If a project policy says "Azure-only", note that **no Azure-native path exists for Indian PSTN today**. Any of the above is a non-Azure telephony carrier, which is the owner's call.

### 2.8 Others checked: sales-led, with no public self-serve streaming spec found

- **Tata Tele Business – Smartflo**
  - Voice streaming exists. The dashboard path is Settings → Channels → Voice → Voice Streaming (WSS endpoint), and the Click-to-Call API is used for outbound [secondary: [Sarvam Smartflo guide](https://docs.sarvam.ai/voice-agents/deploy/telephony/smartflo.md)].
  - A search summary of a community Pipecat serializer grouped Acefone with Smartflo. Whether the two share a protocol is [unverified]. The Acefone protocol itself is **μ-law 8 kHz**, 100 ms frames, `mark`/`clear` events [primary for Acefone: [Acefone bi-directional streaming](https://docs.acefone.in/docs/bi-directional-audio-streaming-integration-document)].
  - Pricing is plan-based, e.g. "Cloudphone 500 … Rs 500/channel" [secondary]. KYC and timeline [unverified]. Enterprise sales cycle.
- **Knowlarity / SuperReceptionist:** Has per-number WSS streaming with **L16 at 16 kHz** and `playAudio` [secondary: Verloop integration guide]. No public Knowlarity spec, pricing or KYC found [unverified].
- **Ozonetel, MyOperator, Airtel IQ:** No public bidirectional-WebSocket documentation found. Integrations are described only by third-party bot vendors [unverified]. Not candidates for this week.
- **LiveKit:** Not a carrier. It is useful later if you move to SIP. Plivo documents LiveKit as "supported through region pinning" for India [primary: [Plivo calling-in-India](https://www.plivo.com/docs/voice-agents/sip-trunking/deploy/calling-in-india.md)]. Plivo's same page lists **Vapi as "not supported"** for Indian numbers. Your own WebSocket server makes LiveKit unnecessary for this test.

---

## 3. TRAI and DoT points that matter

| Rule | Effect on a self-test | Source |
|---|---|---|
| **TCCCPR 2018 as amended 12 Feb 2025:** "restricts senders from using normal 10-digit numbers for telemarketing". 140 series is for promotional calls; 1600 series for transactional and service calls. It also adds "disclosure of the use of auto-dialers/robo calls". | **Does not apply to calling yourself.** That is not commercial communication. It matters for the production pilot: you will need consent, and 140 series plus DLT if anything is promotional. | [TRAI PR 11/2025](https://trai.gov.in/sites/default/files/2025-02/PR_No.11of2025.pdf) [primary] |
| **TRAI PR 91/2026 (10 Jul 2026):** "1600xx series … for service and transaction calls by regulated entities of BFSI sector … and by government entities". "140xx series numbers for making promotional calls by entities of any sector". Promotional senders "must register with Telecom Service Providers under the TCCCPR framework". | A non-BFSI company uses a **landline-series DID** for service calls, which is what Plivo and Vobiz sell. **No DLT is needed for the test.** | [TRAI PR 91/2026](https://trai.gov.in/sites/default/files/2026-07/PR_No91of2026.pdf) [primary] |
| **Media anchoring and Indian-number caller ID** for domestic routes | Keep the WebSocket server in India (Pune is fine). You cannot present your own mobile as the caller ID. | Plivo and Vobiz docs above [primary] |
| **DoT spoofed-international-call blocking** (since 22 Oct 2024) | International routes must show a **foreign** caller ID. Such calls may be labelled "International Call". | [NewsOnAir](https://www.newsonair.gov.in/international-incoming-spoofed-calls-prevention-system-launched) [primary, govt broadcaster]; labelling [secondary] |
| **Wrong series is itself a violation**, and complaints count as UCC "regardless of consent" | Do not run demo or outreach calls to third parties from a landline-series DID if the content is promotional. | [Plivo india-calling](https://www.plivo.com/docs/voice/concepts/india-calling.md) [primary] |

---

## 4. Side-by-side

| Provider | Indian DID (series) | Calls your Indian mobile | KYC (who / docs / time) | Trial usable for a streaming test? | Bidirectional WS format | Price (published) |
|---|---|---|---|---|---|---|
| **Plivo IN** | 080/022 landline; 140; 160 | Yes, domestic, from your DID | Business: GST **or** COI **or** Udyam; automated, ~5 min | No (KYC first); $10 credit claim | μ-law 8k; L16 8k/16k (24k in XML ref) | ₹0.38/min in and out, ₹200/month, streaming included, 30 s pulse |
| **Vobiz** | "91-series" mobile, landline, 140, 160 | Yes, domestic, from your DID | **Individual: Aadhaar + PAN**; company: PAN + GST; ~2 min (docs conflict) | Outbound-only trial, ₹25 credit | In: L16 8/16k, μ-law 8k. Out: L16 8/16/24k, μ-law 8k | ₹0.65/min WS in and out, ₹500/month DID + setup (docs; India price page unreadable) |
| **Exotel** | 080 DID, 9XXX mobile, 1800 | Yes | Business only; 1–3 (to 5) business days; plus streaming enablement by email | No (AgentStream needs KYC) | slin 16-bit 8k (16k/24k via param); ≥100 ms chunks | Plans from ₹9,999 / 5 months; streaming priced by sales |
| **Twilio** | None usable | Yes, **from a non-Indian caller ID only** | None beyond upgrade (payment + address) | **No: `<Stream>` blocked on trial** | μ-law 8k only | $0.0496/min to IN mobile + $0.0044/min stream; US number $1.15/month |
| **Telnyx** | Mobile, 4 districts only (Sep 2026) | IN numbers: within India. Foreign numbers: needs higher account level | Address in 4 districts; heavy business docs | $5, one verified number, 10-min calls | PCMU…L16 16k, OPUS/AMR-WB 16k | Stream $0.0035/min; India rates [unverified] |
| **Vonage** | Inbound-only by request | From a foreign caller ID | Request-based | [unverified] | L16 8/16/24k binary | [unverified] |
| **ACS** | None (India not listed) | — | — | US billing only | PCM 16/24k | — |

---

## 5. Ranked recommendation

1. **Fastest (same day):**
   - **No registration:** **Vobiz** with individual e-KYC.
   - **Have GST, COI or Udyam:** **Plivo India**. It is as fast, cheaper, and better documented.
2. **Cheapest:** **Plivo India.**
   - Test week, Plivo [estimate]: ₹200 number + 120 min × ₹0.38 ≈ **₹246 + GST**.
   - Vobiz equivalent [estimate, using doc prices]: ₹500 setup + ₹500 rental + 120 × ₹0.65 ≈ **₹1,078 + GST**.
   - Twilio fallback [estimate]: about **$5–6** plus your ISD cost, plus whatever minimum balance Twilio asks at upgrade [unverified].
3. **Best for a production pilot:** **Plivo India.**
   - Why: lowest published INR rate, streaming included, automated KYC, documented TRAI handling, and LiveKit/Pipecat support if you move to SIP.
   - Keep **Exotel**, the incumbent with a Mumbai instance and 16/24 kHz option, or **Vobiz** (24 kHz playback, individual-friendly) as the second carrier for failover and A/B voice-quality tests.
   - Before scaling, measure each provider's mouth-to-ear latency on your own handset. None of the latency figures above is measured.

### What the founder must provide or do

**Path A — Plivo India** (if a registration exists, or you legitimately get a free Udyam certificate first):
1. Sign up at plivo.com. **Create an organization with Data Region = India.** It cannot be changed later.
2. Add an **Indian-issued** credit or debit card. International cards are rejected in the India region.
3. Submit KYC with **one** of these: GST certificate, COI, or Udyam certificate. **The first application must be sealed (stamped) and signed by the authorized signatory.** Name and details must match exactly; blurry or expired documents are a common rejection reason.
4. Once accepted (about 5 min for 080/022), **rent an 080 or 022 number** for ₹200/month and top up a few hundred rupees.
5. Expose a **public `https://` Answer URL** and a **`wss://` endpoint with a valid TLS certificate** on the Pune VM. You need a DNS name; open 443.
6. Answer URL returns:

   ```
   <Response><Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-l16;rate=16000">wss://…</Stream></Response>
   ```

   Use μ-law 8k if you want the lowest-latency setting Plivo recommends.
7. **Inbound test:** dial the 080/022 number from your mobile.
8. **Outbound test:** use the Call API with `from` = your Plivo DID, `to` = your mobile, `answer_url` = the same XML.

**Path B — Vobiz** (individual):
1. Register at console.vobiz.ai. Email verification code; ₹25 starter credit.
2. In KYC choose **Individual**: Aadhaar e-KYC (OTP to the Aadhaar-linked mobile) + PAN. At this step, confirm the "India-registered businesses only" wording does not block an individual.
3. Add a payment method and top up about ₹1,500. Buy an India DID in the console; the setup fee and first month are debited at purchase.
4. Allow the Vobiz IP ranges on TCP 443 to the VM, from the [IP whitelisting](https://www.vobiz.ai/docs/concepts/ip-whitelisting) page.
5. Create an XML Application whose answer_url returns:

   ```
   <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-l16;rate=16000">wss://…</Stream>
   ```

   Send `playAudio` as L16 at 16 or 24 kHz.
6. Attach the DID to the application.
7. **Inbound test:** dial the DID.
8. **Outbound test:** use the make-call API with `from` = your DID.

**Path C — fallback, Twilio** (only if A and B both fail):
1. Upgrade a Twilio account (address, payment, starting balance). A trial will not run `<Stream>`.
2. Buy a US local number.
3. Make sure India is enabled in Voice geographic permissions [unverified default].
4. Answer with `<Connect><Stream url="wss://…"/></Connect>` and handle **μ-law 8 kHz** both ways.
5. **Agent calls you:** place the call from the US number to your mobile.
6. **You call the agent:** dial the US number, which needs ISD enabled on your SIM.
7. Expect international labelling and the extra round trip. If you are on Jio in Maharashtra, check the July–August 2026 incident first.

### Quick measurement tip (any path)
Have the WebSocket server log a monotonic timestamp on every inbound `media` frame and every outbound `playAudio` you send. Record the call on a second phone held to the handset speaker. "Mouth-to-ear" is the gap between you stopping speaking and hearing the agent's first audio, minus your server's own logged STT→LLM→TTS time. That leftover is the phone leg. Do this for each provider before choosing one for the pilot.

---

## 6. What I could not verify (open items)

1. Vobiz: India per-minute, DID and setup prices on the live price page (it is client-side rendered). Whether an individual-KYC account can really rent a DID, given the docs conflict. Whether trial outbound is limited to verified numbers.
2. Plivo: whether the $10 free credit applies to India-region organizations. Which `playAudio` sample rates are accepted beyond 8 kHz. Whether GST is added on invoices.
3. Exotel: AgentStream per-minute price, ExoPhone rental (the docs page now 404s), whether pay-as-you-go exists without a plan, and the 60-minute and 10-second limits.
4. Twilio: minimum starting balance at upgrade, whether India is enabled by default in geo permissions, whether the Jio issue is actually fixed, and Indian-card behaviour for top-ups under RBI e-mandate rules (a related SendGrid support note exists; Voice is not confirmed).
5. Telnyx and Vonage: India per-minute rates. Telnyx India activation time.
6. Whether Indian operators show "International Call" on every incoming foreign call in 2026.
7. All latency figures are vendor claims or my estimates; **none were measured**.
