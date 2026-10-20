I did not write report.md: this subagent harness forbids report files, and the sibling lanes hit the same rule. The report text is below. Every claim is in claims.json, which has 64 claims (48 observed, 11 vendor-claimed, 5 inferred) and gives each one an evidence path and the date 2026-10-20. No sign-up, login, form, OTP or demo request was made.

Grading rule: a documented API object or parameter counts as observed, because the doc is the interface. A stack, performance or capability statement counts as vendor-claimed unless a capture or code line confirms it.

DIMENSION 1: PRODUCT SURFACE
- Three separately sold layers:
  - **VoiceBot:** a prompt-built agent. Its console lives at voicebot.in.exotel.com for India and voicebot.sg.exotel.com for Singapore.
  - **AgentStream:** bring-your-own-bot over WebSocket, plus the StreamKit SIP bridge and SIP trunking.
  - **Harmony:** contact centre plus "Monitored Bot" human-in-the-loop. A monitor sees live sentiment, gets Sentiment Crash and Repetition Loop alerts, and can Barge in.
- **Builder:** prompt, then generated Identity, Objective and Behaviour, then Configuration, then versions. Templates, Enhance Prompt and Web Call are all marked "Coming Soon". Testing means placing a real phone call.
- **Copilot builder:** the open-source Exotel MCP server has 131 tools, 46 of them for VoiceBot and its Tools Server.
- **Campaigns for a bot span two consoles:**
  - the bot's WSS URL is copied from the voicebot console;
  - the flow is built in App Bazaar on my.exotel.com;
  - the list and schedule are set in Campaigns.
- The public login-page bundle has 21 console routes. None of them is a campaign, contact, consent or DND route.
- **Maturity:** the Sep 2026 release post admits these bugs:
  - 10 s of dead air;
  - ~29 s dead calls;
  - distorted recordings;
  - mislabelled outcomes;
  - duplicate rows.
- **l4a parity corrections:** dtmf, knowledge base, tools, post-call extraction, A/B, analytics and Indic are now yes. Warm transfer and AMD are partial (AMD is an ECC contact-centre licence only). Full table in parity-delta.csv.

DIMENSION 2: DOCS AND API
- **Two portals:**
  - developer.exotel.com runs on Docusaurus and lists 341 pages. After three passes, 34 .md links still fail and 5 are dead as both .md and HTML.
  - docs.exotel.com runs on Archbee and lists 915 pages, 357 of them for the Ameyo contact centre.
- **Contradictions:**
  - plan names: Starter/Growth/Enterprise in the docs versus the Dabbler/Believer/Influencer plans actually sold;
  - trial credits: 500 versus 1,000;
  - three different voicebot console hosts.
- **No VoiceBot OpenAPI is published.** I rebuilt the data model from 95 endpoint constants in the bundle plus the MCP source:
  - assistants with immutable versions and traffic allocation;
  - personas and specializations;
  - provider and model lists for LLM, TTS, ASR and VAD;
  - text-sessions and test-threads;
  - sessions, outcomes, call-logs, reports, call ratings and feedback;
  - Superset analytics;
  - dp-endpoint, which returns the bot's WSS URL.
- The voicebot API has no contact, campaign, consent, opt-out or memory object.
- **An outbound bot call is two requests:** get the dp-endpoint, then POST Calls/connect with StreamUrl. So Exotel's own bot rides the same AgentStream path as any BYO bot.
- **AgentStream protocol:**
  - Twilio-shaped: events connected, start, media, dtmf, mark, clear and stop; ids MZ, CA and AC;
  - audio is base64 16-bit PCM at 8 kHz, with 16 or 24 kHz available as upsampled;
  - chunks of 3,200 to 100,000 bytes, in multiples of 320;
  - 60 min session cap.
- **Campaigns v2:**
  - one absolute send_at/end_at window, with no recurrence and no time-zone conversion;
  - 0–3 retries;
  - a throttle;
  - duplicates dropped by default.
- **CSV import:** numbers containing spaces, dashes or brackets are rejected, not normalised.

DIMENSION 3: ARCHITECTURE
- **Observed:**
  - **India hosting:** on AWS ap-south-1. Hosts: voicebot-production-alb, api.in, my.in, ccm-api.in, mcp.
  - **Singapore hosting:** on AWS ap-southeast-1. The API load balancer is named "twilix" and the dashboard's is named "obelix".
  - **Other hosts:** the marketing site runs on Vercel (Next.js). India login goes through Auth0, and the status page is Atlassian Statuspage.
  - **Console stack:**
    - it is a module of the Ameyo-lineage ECC web app: React, MUI X, Keycloak, XMPP, and a 10 MB useEccContext chunk;
    - it embeds the exotelSDK WebRTC client, built on a vendored SIP.js 0.20.0;
    - the SDK's source map is public;
    - the console ships SDK version 1.0.22, while npm has 3.0.17.
  - **Carriers:** status-page maintenance notices name Airtel, Tata, Jio and Vodafone.
- **Vendor-claimed:**
  - **Media plane:** Asterisk-based, moving 20 ms frames. The ClearStream denoiser (Go, RNNoise or DeepFilter) is targeted for end-October 2026.
  - **Certified Hindi/English stack:**
    - STT: Deepgram or ElevenLabs;
    - LLM: Gemma;
    - TTS: Smallest or ElevenLabs, default voice "Avni";
    - code-switching works only when STT and TTS come from the same provider.
  - **Indic alpha stacks:** run on Azure, Sarvam, Gemini and Google.
  - **Latency:**
    - Connect call setup ~700 ms average, 1.1 s p95;
    - "sub-20 ms" media;
    - Exotel says it has never measured a natural turn.
- **Inferred:** Exotel runs its own orchestration. The bundle has no LiveKit, Pipecat or Daily references.
- Exotel publishes AgentStream or SIP guides for ElevenLabs, LiveKit, Bolna, Retell, Smallest, Sarvam, Pipecat, Cartesia and OpenAI. It claims "~40% of India's voice-AI conversations run on Exotel."
- There is no public web-call widget: 0 WebSockets on the marketing pages.

DIMENSION 4: PRICING
- **Plans are published:**
  - Dabbler: ₹9,999 for 5 months (₹4,999 rental + 5,000 credits). This structure is unchanged since a 2017 blog post.
  - Believer: ₹19,999.
  - Influencer: ₹49,499.
  - Contact centre: XPrime $70, XPro $100.
- **This corrects l4a/l4c.** The earlier "quote-based since 2025" reading came from Common Crawl captures of the /pricing hub page, which carries no prices.
- AgentStream and VoiceBot per-minute prices are not published. An all-in list price is unknown.
- **PSTN:** ₹0.80–1.00/min outbound "typically" (vendor-claimed), billed in 60 s pulses. That inflates billed minutes about 25%, against about 12% for 30 s pulses.
- **Reconstructed COGS for Exotel's VoiceBot** (inferred, from 2026-10-18 component list prices): ₹1.42 / 1.95 / 3.60 per minute (lo / mid / hi). At ₹3.5–7 market prices the mid case implies a 44–72% margin.
- **VP on AgentStream:** telephony would cost ₹0.34–0.54/min more than the Plivo model, before any stream fee. That puts VP base-tier COGS at ₹2.02–2.22 or more.

DIMENSION 5: VELOCITY (2026-04-20 to 10-20)
- 17 engineering posts.
- New docs pages: AgentStream 9, MCP 7, VoiceBot 2.
- npm: exotel-ai-assist 33 releases.
- GitHub: ExotelMCP 25 commits from 7 authors.
- The developer changelog has not been updated since 16 Feb 2026.
- **Launches:**
  - Connect Voice AI API and guides for 9 platforms (Apr);
  - Dubverse team acqui-hire (Apr);
  - MCP server (May);
  - an AI-initiated call via MCP (Aug);
  - model failover, versions, nudges, a 20-min cap and Maya TTS (Sep).
- **Status page:**
  - 5 unplanned incidents, all on 22–23 Jun and all posted after the fact;
  - 42 maintenance notices;
  - no VoiceBot or AgentStream component;
  - 2 components showing major_outage with no incident open.

DIMENSION 6: INDIA PLUMBING
- **What Exotel handles:**
  - 140-series numbers for promotional calls (DLT required);
  - DIDs for transactional calls to existing customers only ("no cold calling");
  - an NCPR "whitelist" of numbers that called the ExoPhone in the last 6 months;
  - a signed DND opt-in agreement with CRM lead proof for other NCPR numbers;
  - a block on promotional calls to J&K numbers;
  - claimed NDNC filtering at list upload and at execution;
  - India data in Mumbai, with the region fixed permanently at sign-up;
  - opt-in, post-call-only PII masking (audio is not masked, and live webhooks are not masked);
  - 1600/1601 allocation under its UL VNO licence (vendor-claimed).
- **What it leaves to the buyer:**
  - calling windows: 09:00–21:00 is advice only, with no documented enforcement;
  - recording consent;
  - opt-out suppression for voice.
- **KYC gates everything.** Each item below needs company KYC (1–3 business days):
  - numbers;
  - the Voicebot applet;
  - AgentStream, which also needs an enablement email.
- No page says AgentStream works on 1600 numbers, so REG-25 stays open.
- **Lobbying:** Exotel has asked TRAI not to make consent mandatory for AI auto-dialled calls.

DIMENSION 7: FAILURE MODES
- **Top complaint codes:** SUPPORT, TELEPHONY, ACCOUNT_UI, then BILLING. This is soft: about 17 deduplicated items, and the earlier lanes coded them inconsistently.
- **Quoted threads:**
  - Trustpilot, 23 Apr 2026: a long-time IVR customer got no AI-voice demo after a week ("absolutely no response or progress").
  - Reddit, Feb 2025: a builder was told KYC comes "before even a demo".
  - Trustpilot: "worest customer service"; "hidden charges"; "chat assistant is clunky".
  - Capterra.in: UI is outdated; recordings are hard to find.
  - r/AI_Agents: Exotel's PSTN compression surprises builders.
  - LiveKit community: Exotel has no SIP REFER, transfers must go through Exotel's own API, and users proxy through Asterisk.
  - The vendor's own admitted Sep 2026 bugs (see dimension 1).

DIMENSION 8: v2 NOTES (memory and learning)
- **Marketing claims** a CCDP "unified memory layer" and a "Kaizen self-learning loop". The CCDP doc page is empty, "Kaizen" appears in no doc, and the API has no memory object. This supports the CMP-01 pattern of marketing running ahead of the docs.
- **What actually exists:**
  - versions with A/B traffic allocation;
  - feedback categories;
  - call ratings;
  - outcomes;
  - a call evaluator plus recommender agent, still in testing.

WHAT THIS MEANS FOR THE THREE DECISIONS
1. **Pre-sale or post-sale first.**
   - Exotel makes post-sale on existing-customer DIDs easy: the whitelist plus the opt-in agreement covers it. It forbids cold calls on DIDs and pushes promotional calls onto 140-series with DLT.
   - Calling windows, consent and opt-outs stay with the buyer. That is a platform job VP can own, and it favours post-sale renewals first.
   - Exotel can supply the buyer's 1600 numbers. Whether bot streaming works over 1600 is still unknown.
2. **v1 parity floor.** Must-be features a buyer will not switch without:
   - a prompt builder with versions;
   - knowledge base;
   - HTTP tools;
   - webhooks with outcomes;
   - DTMF;
   - transfer to a human;
   - list campaigns with retries;
   - recordings;
   - India data residency;
   - a BYO-carrier path. Supporting AgentStream is cheap because the protocol is Twilio-shaped and Pipecat already ships a serializer.

   Performance features: Indic stacks, A/B testing, analytics, PII masking. Delighters at Exotel today: MCP "build by chat" and monitored-bot supervision.
3. **Where VP can be measurably better.** Five tasks to run against Exotel:
   - list-to-calls in one console, with number normalisation and opt-out suppression;
   - enforced calling windows and DND/consent records;
   - voicemail detection on the bot path;
   - failure reasons a person can act on, plus a single export;
   - a same-day self-serve start, against Exotel's KYC, email enablement and sales-gated pricing.

   Transport is parity, not a moat: Exotel's own bot rides the same WebSocket.

**Risk:** riding Exotel as VP's carrier costs more and is gated. Its terms of service (§6.2) also bar customers from building a competing product. Keep Plivo primary, and use Exotel only where the buyer already holds Exotel or 1600 numbers, under a written agreement.

ACCOUNT PHASE NEEDS
The list is in account_phase_needs. 14 predictions are pre-registered in predictions.json.

---

## Structured result (from the workflow run wf_560edf6c-5d6, public-material phase)

### Key findings

- Exotel's own VoiceBot runs over the same AgentStream WebSocket path any BYO bot uses (the ExotelMCP source fetches the bot's wss dp-endpoint, then POSTs Calls/connect). The protocol and REST API are Twilio-shaped (MZ/CA/AC ids; the Singapore API load balancer is named 'twilix'). Transport is parity for VP, and supporting AgentStream is cheap. [observed/inferred: EXO-12, EXO-20]
- Exotel carries many of VP's deep-set competitors: it publishes AgentStream/SIP guides for ElevenLabs, LiveKit, Bolna, Retell, Smallest, Sarvam, Pipecat, Cartesia and OpenAI Realtime, and claims ~40% of India's voice-AI conversations run on it. [vendor-claimed: EXO-28]
- Documented certified Hindi/English stack: Deepgram or ElevenLabs STT, Gemma LLM, Smallest AI or ElevenLabs TTS (voice 'Avni'). Code-switching works only when STT and TTS come from the same provider. Nine Indic languages are alpha. Exotel runs its own orchestration (no LiveKit/Pipecat/Daily in the console bundle). Hosting is AWS ap-south-1 for India, observed via DNS. [EXO-19, EXO-22, EXO-23]
- The VoiceBot console is a module of the Ameyo-lineage ECC web app (React/MUI X, Keycloak, XMPP, a 10 MB useEccContext chunk, SIP.js 0.20.0 WebRTC SDK with a public source map). The public login bundle exposes 95 API endpoint constants and no campaign, contact, consent, opt-out or memory object. [observed: EXO-04, EXO-10, EXO-25]
- Calling a list with a bot spans two consoles (bot URL copied from the voicebot console into an App Bazaar flow and Campaigns on my.exotel.com). Campaigns allow one absolute window and 0-3 retries. Malformed numbers are rejected, not normalised. There is no opt-out suppression, and AMD exists only as an ECC contact-centre licence. [observed: EXO-05, EXO-15, EXO-16, EXO-09]
- Pricing correction: the business plans are published (Dabbler INR 9,999 / 5 months, the same structure as in 2017). The 'quote-based since 2025' reading in l4a/l4c was an artefact of Common Crawl capturing the /pricing hub page, which carries no prices. VoiceBot and AgentStream per-minute prices are unpublished. PSTN is 'typically' INR 0.80-1.00/min in 60-second pulses. [EXO-32, EXO-33, EXO-34, EXO-35]
- Reconstructed Exotel VoiceBot COGS: INR 1.42 / 1.95 / 3.60 per minute (lo/mid/hi). At the INR 3.5-7 market the mid case is a 44-72% margin. If VP rode AgentStream instead of Plivo, telephony would cost INR 0.34-0.54/min more before any stream fee. [inferred: EXO-36, EXO-37]
- India plumbing: Exotel handles 140-series promotional numbers with DLT, an NCPR whitelist plus a signed DND opt-in agreement, a J&K block, claimed NDNC filtering, Mumbai residency, post-call PII masking, and 1600 allocation via its UL VNO licence (claimed). It leaves calling windows (advisory only), recording consent and voice opt-outs to the buyer. KYC (1-3 business days) gates numbers, the Voicebot applet and AgentStream. No page confirms AgentStream on 1600 numbers (REG-25 stays open). [EXO-42..EXO-50]
- Failure modes in raw threads: no response from AI sales and support (Trustpilot 2026-04-23: no AI-voice demo after a week; TrustScore 2.5 on 5 reviews), hidden charges, an outdated UI, PSTN compression surprising builders, and BYO friction (no SIP REFER, transfer only through Exotel's API, LiveKit users proxy through Asterisk). Exotel's Sep 2026 post admits 10 s dead air, ~29 s dead calls, mislabelled outcomes and duplicate rows. [EXO-53..EXO-58]
- Velocity is high on voice AI and low on docs hygiene. In the last 6 months: 17 engineering posts, MCP and AgentStream docs added, 33 releases of the exotel-ai-assist npm package, 25 ExotelMCP commits from 7 authors. But the developer changelog has not been updated since Feb 2026, 10% of developer llms.txt .md links fail, the status page has no VoiceBot/AgentStream component, and two components show major_outage with no incident open. [EXO-17, EXO-39, EXO-41]
- v2: marketing claims a 'unified memory layer' (CCDP) and a 'Kaizen' self-learning loop. The docs are empty on both and there is no memory API. What actually ships: versions with A/B traffic allocation, feedback categories, call ratings, outcomes, and a call evaluator plus recommender agent still in testing. [EXO-60, EXO-61]
- Contract and dependence risk: Exotel's terms of service (6.2) bar customers from building a competing product, and VP competes with Exotel VoiceBot. Keep Plivo primary and use Exotel only for buyer-held Exotel or 1600 numbers, under a written agreement (risk.2026-10-20.exotel-rails-dependence).

### Pre-registered predictions for the account phase

- EXO-P01: trial sign-up (business email, phone OTP, missed-call verification) to the first VoiceBot call to our own verified handset takes 25-60 min (point 40). Unverified numbers cannot be called before KYC. Confidence 0.6.
- EXO-P02: the first AgentStream BYO-bot call takes >= 2 business days (point 4), because of KYC plus an enablement email to hello@exotel.com. Confidence 0.8.
- EXO-P03: building the standard Hinglish agent takes 15-40 min. There are no templates, no prompt enhancer and no web-call test, so every test iteration is a real phone call. Code-switching needs STT and TTS from the same provider. Confidence 0.65.
- EXO-P04: the messy 50-row CSV needs two consoles. >= 3 malformed rows are rejected rather than normalised, duplicates are dropped silently, and the opt-out row is dialled unless removed by hand. Confidence 0.7.
- EXO-P05: there is no daily calling-window control, and a campaign ending at 22:30 IST is accepted without a compliance warning. Confidence 0.75.
- EXO-P06: there is no AMD on the bot path, and on a trial only a flow-level cold transfer (Connect applet) is available. Warm transfer with context needs Harmony/Monitored Bot. Confidence 0.7.
- EXO-P07: of 3 induced failures, >= 1 has no actionable reason in the UI, or the reason appears only in a second console. Confidence 0.6.
- EXO-P08: no single per-call export joins outcome, transcript and recording without using the API. Confidence 0.6.
- EXO-P09: the handset reply gap on Indian PSTN (certified hi/en stack) has a median of 1.6-2.4 s (point 1.9) and p90 >= 2.8 s, over n >= 30 turns. Confidence 0.5.
- EXO-P10: on the Connect Voice AI path the first bot audio arrives 0.8-2.0 s after the callee answers; on the Flow path with a cached greeting, < 0.6 s. Confidence 0.55.
- EXO-P11: with a Hinglish caller, >= 90% of turns stay in Hindi, Hinglish or English. Confidence 0.6.
- EXO-P12: using the docs' named-persona prompt pattern, the bot fails to give an honest AI disclosure when asked in >= 2 of 5 calls. Confidence 0.45.
- EXO-P13: the first human reply to a written request for AgentStream enablement and pricing takes > 1 business day, or the price is withheld until a sales call. Confidence 0.65.
- EXO-P14: the VoiceBot all-in quote is INR 3-8 per minute with a commitment, AgentStream adds INR 0.2-1.0/min on top of PSTN, and billing uses 60-second pulses. Confidence 0.5.

### Needs a trial account to learn

- Setup checklist for Instinct: sign up at https://my.in.exotel.com/auth/register with team@vyakti.ai and choose the INDIA region (the region cannot be changed later). Complete the phone OTP, then verify the number by giving a missed call to 09513885656 or 02249360005. Put credentials (API key, token, Account SID, subdomain api.in.exotel.com) only in a mode-600 scratchpad env file.
- Exotel KYC needs Vyakti's company documents: Certificate of Incorporation or GST certificate, business PAN, an authorised signatory's ID, and a letter of authorisation on letterhead if the signatory is not a director. It takes 1-3 business days, up to 5. Without KYC, outbound calls work only between verified users of the account, so the owner's test handset and the Plivo test number must be added as verified co-workers.
- After KYC, email hello@exotel.com with the subject 'Enable Stream/Voicebot Applet for <Account SID>', and ask for Connect Voice AI to be enabled. In the same email ask for: written VoiceBot and AgentStream per-minute prices, pulse length, ExoPhone rental, concurrency limits, whether AgentStream works on 1600/1601 and 140-series numbers, and whether a BYO/partner agreement overrides ToS 6.2 (no competing product).
- Confirm whether VoiceBot is really 'live by default on all Exolite trial accounts' without KYC (the Sep 2026 post says yes; the docs say KYC unlocks the Voicebot applet). Time sign-up to first bot call (EXO-P01).
- Run the fixed task list twice, timing each run with a screen recording: build the standard agent; upload the messy 50-row CSV through App Bazaar + Campaigns; schedule inside 09:00-21:00 and try 22:30; voicemail and transfer (check whether AMD can be enabled for a bot campaign); find a failed call and its reason; export. Score EXO-P03..P08.
- Run the PSTN battery from l4b (busy, skeptic, elderly pause, angry, confused, Hinglish code-switching, babble, 'are you a bot?') with the Exotel bot calling our Plivo-recorded number in stereo. Measure handset reply gap, first audio after answer, cut-ins, language hold and disclosure (EXO-P09..P12). This also closes open.2026-10-20.handset-reply-gap for an incumbent.
- Once we have access, record the voice library per language (the docs say to ask your Exotel contact), the provider and model dropdowns, model-failover behaviour, the 20-min cap and per-bot nudges. Also check where transcripts and recordings are stored and how retention is configured (DPDP), and whether live webhook transcripts arrive unmasked.
- Test AgentStream with VP's own bot from the Central India lab VM. Check: 8/16/24 kHz delivery and whether the fallback to 8 kHz happens; whether mark and clear give clean barge-in; whether the 100 ms minimum chunk sets a floor on playback; and Connect API setup time against the claimed ~700 ms average / 1.1 s p95.

### Run facts

- Claims: 64 {"observed": 48, "vendor-claimed": 11, "inferred": 5, "unknown": 0}
- REA used: True
- REA notes: The npm package was rea-agents@latest, which resolved to 6.7.0. `npx -y rea-agents@latest --help` worked. Results by command:
- **inspect-web-network-capture:**
  - It ran on slimmed Playwright HARs of voicebot.in.exotel.com and exotel.com (exit 0).
  - The output is the HAR records re-emitted with digests and provenance, with no analysis added.
  - It rejected the Auth0 login HAR outright (invalid_request). One Facebook-pixel URL contains '[ph][0]' brackets and fails REA's URI validation, and REA fails closed on the whole file.
- **analyze-web-bundle:**
  - Run against a headless Chromium CDP target (voicebot login page, allowed origin, --fetch-source-maps, 4 s observation).
  - It produced no output and was killed at 300 s (exit 124). This is the same result the Vapi lane got.
- **inspect-web-page** (same target):
  - Returned frames, a script inventory, DOM URLs and storage.
  - Status was 'policy_filtered' for scripts, storage keys, websockets and workers, so it gave no bundle content.
- **Fallback:**
  - Playwright HAR capture, plus my own extraction of 95 API endpoint constants and 21 routes from the 17.7 MB of public login-page JS (code/bundle_endpoints.py).
  - Reading the public exotelSDK.js.map, which showed a vendored SIP.js 0.20.0.
- **Not available:** no APK analysis. Exotel's VoiceBot has no app, and the Ameyo agent app could only be fetched from third-party mirrors, which the boundaries rule out.

Net: REA confirmed provenance but contributed no architecture facts on this vendor.

---

## Verification (adversarial pass, 2026-10-20)

Full log: `research/2026-10-20/teardown/exotel/verify.md`. In `claims.json` every changed claim keeps its original text in `claim_before` and its original grade in `verification.grade_before`.

**Totals.**
- 44 of 64 claims re-checked: 29 confirmed, 10 corrected, 5 downgraded, 0 refuted outright.
- 3 sub-claims refuted in place: the AMD parity cell, the EXO-37 magnitude, and EXO-45's "page is dead" and "left to the buyer".
- 6 verifier claims added.
- Grades now: 51 observed, 13 vendor-claimed, 4 inferred, 2 unknown (70 claims).

**Downgrades.**

| claim | change | reason |
|---|---|---|
| EXO-20 (Twilio-shaped) | inferred → unknown | It rested on doc placeholders, the 'twilix' load-balancer name and memory. Real Exotel ids are 32-hex CallSids and name-like AccountSids. Pipecat needs a dedicated Exotel serializer. |
| EXO-22 (own orchestration) | inferred → unknown | A front-end bundle cannot show what serves the bot's WSS dp-endpoint. The TalkToBot chunk was never captured: only 46 of about 140 chunks were. |
| EXO-24 (BYOK) | observed → vendor-claimed | Only a user guide supports it. |
| EXO-30 (no web-call widget) | observed → inferred | A universal negative from three page loads without clicks. |
| EXO-31 (Superset / Camel / Azure scorer) | observed → vendor-claimed | Superset is observed. Camel is blog-only. The Azure scorer comes from a personal repo. |

**Corrections that change the report's text above.**
- **Dimension 1 / parity, AMD.** "AMD is an ECC contact-centre licence only" is wrong.
  - A Beta Voice API AMD exists (docs.exotel.com/voice-apis/answering-machine-detection-amd, created 2026-06-15). It is enabled by the account manager, returns its result in the terminal StatusCallback about 3–5 s after answer, and is not shown in the dashboard.
  - ExoML create-a-leg has `amd_enable`, and ExoML Legs can start an AgentStream.
  - What stays true: no doc shows AMD on Connect Voice AI, Campaigns v2 or the Voicebot applet. (EXO-09, EXO-V01)
- **Dimension 6, "what it leaves to the buyer".** True on the Campaigns v2 / VoiceBot path, false for Exotel as a whole.
  - The calling-hours FAQ is live and says Exotel "does not automatically enforce calling hour restrictions at the API level". The report called that page dead.
  - The ECC contact centre has tenant-level and process-level DNC lists and per-lead daily time windows.
  - The Outbound Dialer guide lists a dashboard "Daily window" and "Days of week". (EXO-45, EXO-V02, EXO-V03)
- **Dimension 4, VP on AgentStream.** The penalty is +0.46 to +0.69 INR/min like-for-like, not +0.34 to +0.54. VP base-tier COGS becomes about 2.17–2.40, not 2.02–2.22.
  - The lane compared Plivo per connected minute with Exotel per billed minute.
  - Pulse inflation is about 15% vs 7.4% on the VP call mix. 25% vs 12% holds only under a uniform 0.5–3.5 min assumption. (EXO-37, EXO-35)
- **Dimension 4, pricing history.** The /pricing hub did carry prices in the 2024-03-03 capture, so "never carries prices" is wrong. That the 2025–26 "quote-based" reading was an artefact is inference; Common Crawl refused queries on 2026-10-20. (EXO-32)
- **Dimension 3, architecture.**
  - The console's SDK "1.0.22" is the webrtc-core-sdk package version (Jul 2025) against 3.0.17 on npm (Oct 2026). Confirmed from the npm tarball's build banner.
  - The ECC contact centre ships as about 30 container images from Oracle Cloud's Mumbai registry: Kafka, ksqldb, Citus/Postgres 18, Redis, Eureka, Superset, CCDP and others. "Exotel on AWS" holds for the CPaaS and voicebot hosts only. (EXO-25, EXO-V04)
- **Dimension 2, wording.**
  - MZ/CA/AC ids are doc placeholders.
  - 5 of the 21 "console routes" are not screens.
  - The same ECC app registers contact-centre contacts routes and ships voice-campaign code. (EXO-13, EXO-04)
- **Builder testing.** The bundle has text-session test endpoints and a `botTextTestingService` chunk, so an in-browser text test probably exists. Only voice web call is "Coming Soon". (EXO-03)

**What this changes in "What this means for the three decisions".**
- **Decision 2.** DNC/opt-out lists, a daily calling window and AMD are parity with Exotel's contact centre, so they are must-be features, not delighters.
- **Decision 3.** Two of the five "where VP can be measurably better" tasks narrow to the bot path, applied by default in one console:
  - enforced calling windows and DND/consent records;
  - voicemail detection on the bot path.

  Exotel has them only in ECC, behind an account manager, or 3–5 s late. The other three tasks stand.
- **Risk.** The larger AgentStream cost penalty strengthens "keep Plivo primary".

**Process conflict to resolve before the account phase (EXO-V06).**
- `risk.2026-10-20.vendor-terms` is `accepted-by-owner`, with mitigation "Exotel account not used for the teardown". The reason is ToS §6.2's standalone no-competing-product promise.
- This report's Instinct checklist, EXO-P01..P14 and `open.2026-10-20.exotel-account-phase` all assume an Exotel trial on team@vyakti.ai.
- The owner must decide, or get a written agreement, before any Exotel sign-up.

**Predictions.** All 14 state a measurable pass rule.
- P02 and P13 have an OR clause that is already true or easy to satisfy.
- P04, P05 and P06 are contradicted in part by docs found in this pass.
- P07's "actionable" needs a rubric.
- P12 tests our own prompt at n = 5.

Suggested amendments are in verify.md. `predictions.json` was not edited.
