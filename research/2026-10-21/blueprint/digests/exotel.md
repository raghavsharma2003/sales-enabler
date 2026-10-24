# Exotel dossier (CPaaS + VoiceBot / AgentStream / Harmony), consolidated 2026-10-21

Grades: [m] measured, [o] observed (capture, docs-as-interface, or dashboard pixel), [v] vendor-claimed, [i] inferred, [u] unknown. Paths are relative to /home/user/sales-enabler.
**Read first.** Nothing about Exotel has been measured on a call. No ring on an Indian line, no API read-back (the account phase had no Exotel lane: research/2026-10-20/account-phase/SYNTHESIS.md lines 222, 271), and the trial is unverified (KYC pending, 150 credits, 0 min used, research/2026-10-21/walkthroughs/exotel/report.md section 0). Every voice-quality statement below is [v] or an unscored pre-registered prediction. Where the dashboard walk rests on Instinct's notes with no pixel, it is flagged [notes].

**Sources read.** teardown/exotel: report.md, verify.md, claims.json (64+6 claims), pricing.json, velocity.json, predictions.json, parity-delta.csv, bundle-endpoints.json. walkthroughs/exotel: report.md, claims.json (55), defaults.json. 2026-10-17 l4a report and r2 findings (Exotel lines). Vendor sections of teardown SYNTHESIS, teardown predictions.md (TP-098..111), account-phase SYNTHESIS, walkthroughs SYNTHESIS. Graph nodes: evidence.2026-10-20.exotel-*, decision.2026-10-20.exotel-rails-not-rival-in-ux, decision.2026-10-21.wt-exotel-parity-and-beat, risk.2026-10-20.exotel-rails-dependence.

## 1. What it is, who buys it, how it makes money
- **A 2011 Bengaluru CPaaS and contact-centre company** that bolted voice AI on top. FY25 operating revenue INR 490.5 Cr, PAT about 20 Cr, telephony cost 212 Cr = 44% of costs [v, Entrackr via l4a company-financials.csv; Inc42 says 475 Cr]. 749 staff; claims 3,500+ businesses and "almost 40% of India's voice-AI conversations" [v, EXO-28]. Telephony resale is the engine; AI is the new wrapper.
- **Three separately sold layers** [o, teardown report dim 1]: (1) VoiceBot, a prompt-built agent with its own console; (2) AgentStream, bring-your-own-bot over WebSocket plus StreamKit SIP bridge and SIP trunking; (3) Harmony, contact centre plus "Monitored Bot" (a human sees live sentiment, gets Sentiment Crash and Repetition Loop alerts, can barge in). Underneath sits the Ameyo-lineage ECC contact centre.
- **Buyer:** mid-market and enterprise with existing Exotel IVR/numbers (BFSI, collections, e-commerce), plus AI-voice startups that use Exotel as carrier. It publishes AgentStream or SIP guides for ElevenLabs, LiveKit, Bolna, Retell, Smallest, Sarvam, Pipecat, Cartesia, OpenAI Realtime [o docs, EXO-28]; ElevenLabs lists Exotel as a native telephony provider since 2026-06-01 (evidence.2026-10-20.elevenlabs-exotel-native). So Exotel is both competitor and rails for VP's other competitors.
- **Money:** published phone-plan prices (Dabbler INR 9,999 for 5 months = 4,999 rental + 5,000 credits; Believer 19,999; Influencer 49,499; 1 credit = INR 1; same Dabbler structure as a 2017 post) [o, pricing.json]. Contact-centre seats XPrime USD 70, XPro USD 100 [o]. VoiceBot and AgentStream per-minute prices are sales-quoted ("Voice Streaming is excluded from the plans, contact hello@exotel.com") [o]. Revenue is minutes, number rental, seats and concurrency (increase is "subject to monthly charges", by email, exotel-25).
- **Stated thesis** [v, EXO-62]: one human supervises many AI bots; models are a commodity "like electricity"; the moat is rails and context.

## 2. Product model and architecture
**Core objects** (95 endpoint constants in the login bundle plus the open-source MCP server, 131 tools of which 46 are VoiceBot/Tools Server) [o, bundle-endpoints.json]: assistants with immutable versions and traffic allocation; personas; provider/model lists for LLM, TTS, ASR, VAD; text-sessions and test-threads; sessions, outcomes, call-logs, reports, call ratings, feedback; Superset analytics; dp-endpoint. **No contact, campaign, consent, opt-out or memory object exists in the voicebot API** [o with coverage caveat: 46 of about 140 chunks captured, verify.md EXO-11]. Contacts and campaigns live in the classic my.exotel.com stack.

**Call lifecycle (outbound bot)** [o, EXO-12]: GET the bot's dp-endpoint (a wss URL), then POST Calls/connect.json with StreamType=bidirectional and StreamUrl. Exotel's own bot rides the same WebSocket any BYO bot uses. Campaign path instead: Go Live creates an App Bazaar flow with the Voicebot applet; list + schedule live in Campaigns v2. Protocol: events connected/start/media/dtmf/mark/clear/stop, base64 16-bit PCM 8 kHz (16/24 kHz available), 3,200-100,000-byte chunks in multiples of 320, 60-min session cap [o docs]. Connect Voice AI is "not for menus, disclosure before bot, bot to human" (those need the Flow path or ExoML Legs) [o, EXO-14]. Pipecat attaches through Exotel's own ExotelFrameSerializer [o, EXO-V05]. Whether the wire format is Twilio-shaped is [u] (EXO-20 downgraded).

**Voice stack.** Documented certified Hindi/English: STT Deepgram or ElevenLabs, LLM Gemma, TTS Smallest or ElevenLabs (voice "Avni"); nine Indic languages alpha on Azure/Sarvam/Gemini/Google; code-switching only when STT and TTS share a provider; denoise and turn detection "applied by default" [v, EXO-23]. Sep 2026: automatic model failover, A/B versions, nudges, 20-min cap, Maya Research TTS [o blog]. Orchestration is [u] (a Pipecat server behind the wss is consistent with the evidence, EXO-22).

**What the stored config really does.** Not tested for Exotel (no API lane). Cross-vendor warning: at 4/4 writable vendors the stored config differed from docs or dashboard and 3/4 silently dropped unknown fields (XS-07/08, teardown SYNTHESIS W10). The dashboard already shows Exotel contradictions between layers:
| Setting | Doc / earlier teardown | Dashboard (2026-10-21) |
|---|---|---|
| LLM | Gemma certified | Google IN, Gemini 3 Flash, config string "gemini-2.5-flash-with-thinking" [notes] |
| STT | Deepgram or ElevenLabs | Bot Details says "azure", Edit view a Deepgram India rule; which serves a call is [u] (exotel-15) |
| TTS | Smallest/ElevenLabs "Avni" | ElevenLabs "Clyde", 183 voices [notes] |
| Denoiser | ClearStream "targeted end-Oct" | Denoiser ON at 0.8 already [notes] |
| Trial credits | 500 vs 1,000 | 150 (exotel-01) |
| Region | India, fixed at sign-up | Account region Singapore in notes [notes, open.2026-10-21.wt-exotel-account-region] |
| Test | phone only | "Test this version" + Test Threads (0) (exotel-04-rollout) |
Defaults that matter [notes unless pixel]: system prompt locked behind a "strict guardrails" sentence (exotel-15); real prompt is a sub-agent Instruction in raw markdown "## Identity / ## Objective" (exotel-16); greeting off, PII masking off, max duration off, nudges at 7 s x3 then end call, VAD empty, 3 intents, concurrency 5 (exotel-25).

**Hosting** [o, EXO-19, V04]: CPaaS and voicebot on AWS ap-south-1 (Mumbai); Singapore on ap-southeast-1; ECC ships as about 30 containers from Oracle Cloud's Mumbai registry; marketing site Vercel; Auth0 login. Carriers named in status notices: Airtel, Tata, Jio, Vodafone (EXO-26).

## 3. Builder and UX end to end
Three shells and three design languages [o, exotel-11, 02, 14]: (A) classic "Obelix by Exotel" console (blue, calls/SMS/campaigns/App Bazaar/ExoPhones), (B) Voice Agents app (indigo; Agents, Integrations > Tools/Database, Interactions, Analytics, Reports, Account, Model Configuration), (C) Engage (SMS/WhatsApp). Three contact surfaces (Address Book, Campaign Lists, Engage) with the same-store question [u] (wt-exotel-44).
**Best moments** (VP must match or beat; walkthrough report section 13):
- Versions with a "Stable / Live" pill, traffic-split table and "Test this version" on the agent (exotel-04-rollout). Note: split control not seen, text only; downgrade to partial.
- Version column in the Interactions log, tying each call to a version (exotel-22).
- Live concurrency meter with last-updated time (exotel-25); reports with an explicit "up to 30 mins" freshness note (exotel-24).
- Save-conflict warning naming the exact overwrite risk (exotel-05); Theme menu with thumbnails (exotel-08).
- A pre-provisioned demo agent "Exotel-Voicebot" and flow already exist at sign-up [i], so a first call needs a verified number, not a build.
- Tools require a passing test before activation [o docs]; knowledge base handles PDF/DOCX/TXT/XLSX with Processing/Trained status [o].
**Worst moments:**
- First-run guidance is one 9-10 px green sentence with five steps (Verify Number, KYC, payment, ExoPhone) and no progress indicator (exotel-01). At least 6 in-app steps after those 5, across 3 surfaces.
- Test tab: phone card shows no input; Web Call "Coming soon" (exotel-02). Templates and Enhance Prompt also "Coming Soon" [o docs].
- Analytics renders a blank broken-frame panel with no message (exotel-23). Campaign form: "Unable to load Caller ID's" and "Unable to load Lists" toasts (exotel-10); KYC gate hidden in an empty state while Create looks live (exotel-14).
- Empty states with no action (Activity, Knowledge Base, "No Results Found" on an empty Campaigns list, exotel-09); prompt in a nested scroll box (exotel-16); inconsistent default date windows 7 / month / 30 days (22, 24, 26); 12-15 s cold load [notes].
- Model/voice/STT pickers are collapsed rows showing a name only: no latency, price, Indic coverage (exotel-15). Vapi and ElevenLabs show these inline.
- Public docs: developer.exotel.com lists 341 pages with 34 failing .md links and 5 dead; docs.exotel.com lists 915 (357 Ameyo); plan names in docs (Starter/Growth/Enterprise) differ from those sold [o, EXO-17].
Hygiene: exotel-11, 12 (owner phone) and 13 (partially visible trial-number digits) must not be published.

## 4. Conversation quality and voice
- **Latency.** Vendor claims are layered and inconsistent [v, EXO-29]: Connect call setup about 700 ms avg / 1.1 s p95; "sub-20 ms" and "<50 ms" media; "<250 ms end-to-end media"; "sub-800 ms response achievable". Its own sample repo lists round trips of about 500 ms (OpenAI Realtime), 750 (ElevenLabs), 600 (Gemini Live), 2-4 s (Gemini S2S), about 4 s (pipeline). Exotel's Sep 2026 post says it has not measured a natural turn and will not quote one. **No public demo exists to measure** (l4b). Handset reply gap: [u]. Pre-registered EXO-P09 (median 1.6-2.4 s, p90 >= 2.8 s, n >= 30, confidence 0.5) and P10 (first audio after answer 0.8-2.0 s) are unscored.
- **Turn-taking.** Dashboard exposes no endpointing, interruption, backchannel or reply-delay control; Denoiser 0.8, empty VAD, nudges 7 s x3 [notes]. Bolna by contrast exposes 500 + 900 ms. Cut-ins unknown; open.2026-10-19.turn-taking (15-42% across our own stacks) applies to every vendor until measured.
- **Hindi/Hinglish.** Hi/en "certified" and 9 Indic alpha [v, EXO-23]; code-switching conditional on same-provider STT+TTS [v]; the account's agent carries English + Hindi only; Hindi voices are tagged for BFSI/collections ("Soft Collections Hinglish Agent") [notes]. There is no Hinglish mode (0 of 6 dashboards have one, walkthroughs SYNTHESIS). Older Capterra: "no more option for voice hindi pronunciation" [o, l4a]. EXO-P11 (>= 90% language hold, 0.6) unscored.
- **Expressiveness.** None documented: no emotion or style control; emotion exists only as live sentiment alerts for a human monitor [v, parity-delta emotion row]. PSTN compression changes how TTS sounds (r/AI_Agents, r2 findings line 264) [o complaint].
- **Honesty.** Docs' named-persona prompt pattern may fail an honest AI disclosure (EXO-P12, 0.45, unscored). No non-removable disclosure layer seen; a locked platform guardrail prompt exists but its text is hidden.
- **Admitted defects (Sep 2026)** [o, EXO-58]: up to 10 s dead air on a slow TTS handshake (now about 2 s timeout-and-retry), about 29 s zero-audio dead calls from voice/language mismatch, distorted recordings, sessions mislabelled "completed by bot", duplicate rows.

## 5. Campaigns, telephony, India readiness
- **Campaigns v2** [o, EXO-15, 16]: from <=5,000 inline numbers or <=5 static / 1 dynamic list; retries 0-3 (linear or exponential; on busy, no-answer, failed); throttle (calls/min, Auto or Custom CPM); duplicates dropped by default; ONE absolute send_at/end_at window (no recurrence, no time-zone conversion); Transactional vs Promotional call type; status callbacks. CSV: header "number"; numbers with spaces, dashes or brackets are rejected, not normalised; 60 MB, 1,00,000 rows static. Audience Static / Dynamic / Dynamic with CSV (exotel-10). A bot campaign spans two consoles plus App Bazaar. Voicebot-side activation: KYC, then an enablement email.
- **Compliance** [o/v]: 140-series promo numbers with DLT; DIDs for transactional calls to existing customers only; an NCPR "whitelist" (callers in last 6 months) plus a signed DND opt-in agreement; J&K promo block; claimed NDNC filtering at upload and execution with dnd_filtered / dnd_category_blocked statuses [v, EXO-44]; Mumbai residency, region permanent; PII masking opt-in and post-call only (audio and live webhooks unmasked) [o, EXO-47]; 1600 via UL VNO licence [v, EXO-50]. Left to the buyer on the API/bot path: calling hours ("does not automatically enforce", FAQ), recording consent, voice opt-out [o, EXO-45, 46]. **Verifier correction:** ECC has tenant-level DNC lists, per-lead time windows and a dialer Daily window; a Beta Voice API AMD exists (account-manager enabled, result 3-5 s after answer, not in dashboard). So DNC, windows and AMD are parity features, but not applied by default on the bot path. Exotel publishes 09:00-21:00; the primary text gives 10:00-21:00 for promotional (RS-15/16).
- **Gaps:** no consent field, DND scrub field or window control on the campaign form in 6/6 dashboards including Exotel (exotel-10). Transfer is a Connect applet chained after the Voicebot applet (cold, no context); BYO bots have no SIP REFER and transfer through Exotel's API; warm transfer needs Harmony. AgentStream on 1600 lines: [u] (REG-25).
- **Politics:** Exotel lobbied TRAI against mandatory consent for AI auto-dialled calls (2024) and for a human-assisted A2P carve-out and 1600 extension (2026); TRAI rejected the carve-outs (r2-untouched-raw 1.1, EXO-51). VP sells the opposite posture.
- **Gate:** KYC 1-3 business days (up to 5); unverified trials call only verified co-workers; payment needs GST details (EXO-49, exotel-01).

## 6. Analytics, QA, memory and learning
- **Observed:** Interactions (ID, customer number, agent, version, date, duration, Completion Source, Intents) [notes]; emailed async Reports; Intents as post-call classification; webhook event types sentiment, summary, intent, entity, outcome, transcript [o, EXO-18]; call ratings, feedback categories; embedded Superset (renders blank in the trial). Harmony adds live sentiment, alerts, CQA, "AI insights".
- **Missing:** no simulation or eval suite, no AI QA scoring in the Voice Agents app [i, wt-exotel-21]; no per-call cost view; no single export joining outcome, transcript and recording without the API [i, EXO-P08]; Sep 2026 admission of mislabelled outcomes shows outcome trust problems.
- **Memory:** marketing claims CCDP "unified memory layer" and "Kaizen" self-learning; CCDP docs page is empty, Kaizen is in no doc, the API has no memory object [o, EXO-60]. Cross-call memory: none at Exotel (also none at Bolna, Sarvam, Vapi).
- **Learning:** only primitives: immutable versions with traffic allocation, feedback, ratings, outcomes, and a call evaluator + recommender agent "in testing" [o/v, EXO-61]. Human-gated; 0 of 8 vendors close the loop automatically.

## 7. Pricing, COGS and unit economics
| Item | Value | Grade |
|---|---|---|
| Plans | 9,999 / 19,999 / 49,499 INR (5-11 months); 1 credit = INR 1 | [o] |
| PSTN | INR 0.80-1.00/min outbound, 0.30-0.50 inbound "typically", 60 s pulse | [v] |
| VoiceBot / AgentStream per-minute | not published; all-in list price unknown | [u] |
| Concurrency | 5 default; increase by email, chargeable, no price | [o exotel-25] |
| Reconstructed VoiceBot COGS | INR 1.42 / 1.95 / 3.60 per connected minute (lo/mid/hi): STT 0.44-0.87, LLM 0.14-0.52, TTS 0.59-1.67, carrier 0.22-0.43, media 0.03-0.10 | [i, pricing.json] |
| Implied margin at INR 3.5-7 market | 44-72% (mid case) | [i] |
| Pulse inflation | 60 s pulse about 15% vs 7.4% for 30 s on VP's call mix (25% vs 12% under a uniform 0.5-3.5 min assumption) | [i, corrected EXO-35] |
| VP riding Exotel instead of Plivo | +0.46 to +0.69 INR/min before any stream fee; VP base COGS about 2.17-2.40 not 2.02-2.22 | [i, corrected EXO-37] |
Reading: Exotel is a telephony reseller with a thin AI layer priced by quote. Its 60 s pulse and hidden stream fee are exposed to a published per-second all-in rate. Pricing is not by itself a wedge (rejected.2026-10-17.parity-undercut); transparency and pulse are.

## 8. Complaints and churn
- Rating splits: Trustpilot 2.5 on 5 reviews (100% one-star, "hasn't replied"); Capterra.in 4.3 on 69 [o, l4a]. Small negative samples are signals, not rates.
- Codes: Exotel web threads (12 coded) TELEPHONY 6, SUPPORT 4, ACCOUNT_UI 4; Ameyo agent app 103 items, 51 coded: OTHER 27, RELIABILITY 12, ACCOUNT_UI 9, TELEPHONY 4 [o, r2 findings lines 228-233].
- Quotes: Trustpilot 2026-04-23, a long-time IVR customer got no AI-voice demo in a week; Reddit Feb 2025, KYC "before even a demo"; "worest customer service", "hidden charges", "chat assistant is clunky"; Capterra: outdated UI, recordings hard to find, "not allowed for automated calls for COD verification" (rigid compliance); LiveKit community: no SIP REFER, proxy through Asterisk; r/AI_Agents: codec compression changes TTS.
- **Why they churn (inferred):** (1) gated, sales-led, slow start (KYC, enablement email, quote); (2) three-console fragmentation and an outdated UI; (3) support non-response; (4) rigid compliance without the tools to act within it; (5) hidden charges; (6) BYO builders leave when transfer/telephony friction exceeds the benefit. Voice naturalness is not what appears in complaints; plumbing and trust are.

## 9. Velocity and likely next moves
- 2026-04-20 to 10-20 [m, velocity.json]: 17 engineering posts; new docs pages AgentStream 9, MCP 7, VoiceBot 2; npm exotel-ai-assist 33 releases; ExotelMCP 25 commits from 7 authors; webrtc-core-sdk releases to 2026-10-16. Launches: Connect Voice AI + 9 platform guides (Apr), Dubverse acqui-hire (Apr), MCP server (May), AI-initiated call via MCP (Aug), failover/versions/nudges/20-min cap/Maya TTS (Sep).
- Hygiene lags: developer changelog stale since 2026-02-16; status page has no VoiceBot/AgentStream component; 5 unplanned incidents all posted after the fact on 22-23 Jun; two components in major_outage with no incident open [o, EXO-41].
- **Likely next moves [i; label as forecast].** (a) Web Call and Templates/Enhance Prompt leave "Coming Soon" (high; already in the UI). (b) ClearStream denoiser GA around end-October 2026 (stated target, [v]). (c) The evaluator + recommender "Kaizen" loop ships in early form, human-gated. (d) In-house or partner Indic TTS from the Dubverse/Maya line to cut ElevenLabs dependence. (e) More MCP/copilot build-by-chat surface (46 voicebot tools already). (f) Bot-path compliance (windows, DND, AMD) migrates from ECC into Campaigns v2, especially as the A2P pre-declaration deadline (about 2026-11-18) nears. (g) More partner guides and bundled enablement with ElevenLabs-style platforms. Pre-registered account predictions: TP-098..111 (EXO-P01..P14) in research/2026-10-20/teardown/predictions.md; P02 (>= 2 business days to first AgentStream call, 0.8) and P13 (sales response slow, 0.65) are the high-confidence ones; P04-P06 are partly contradicted by the verifier.
- Exotel is also named in carriers-move-up risk context (risk.2026-10-20.radar-carriers-move-up): the incumbent moves toward self-serve only if Gupshup/Tata pressure forces it.

## 10 and 11. See the structured adopt and beat fields.
Summary of stance: transport is parity, not a moat (decision.2026-10-20.exotel-rails-not-rival-in-ux). Treat Exotel as rails the buyer may already hold, and as the incumbent whose bot-path gaps define testable tasks. Keep Plivo primary: Exotel costs more, is KYC-gated, and its ToS 6.2 bars building a competing product (the owner's override, directive.2026-10-20.terms-override, accepts the contract risk but it still bears on Exotel as a future carrier).

## 12. Always learn: what to watch and how often
| Signal | Where | Cadence |
|---|---|---|
| Voice AI posts and "what's new in VoiceBot" | exotel.com/build/ blog index (17 posts in 6 months) | weekly |
| Docs diffs (AgentStream, MCP, VoiceBot, ai-assist, conversation-intelligence) | developer.exotel.com llms.txt page list + docs.exotel.com createdAt, esp. intelligent-voice-agents/* | weekly diff of page list; full re-pull monthly |
| Open-source: ExotelMCP, agent-stream repos, npm exotel-ai-assist, webrtc-core-sdk | GitHub commits/releases, npm | weekly |
| Pricing and plans | exotel.com/pricing/business-phone-system, enterprise-contact-center; watch for any VoiceBot/AgentStream per-minute number or a quote page change | monthly, plus on any launch post |
| Status page | Atlassian Statuspage: new components for VoiceBot/AgentStream, after-the-fact incidents, orphan major_outage | weekly |
| Compliance claims | calling-hours FAQ, ndnc-dnd FAQ, 1600 blog; whether AMD or windows reach Campaigns v2 | monthly |
| Console bundle drift | voicebot login bundle endpoints (95 constants), "Coming Soon" badges | monthly (REA unreliable here: rejected.2026-10-20.exotel-rea-bundle-and-har) |
| Reviews and VoC | Trustpilot, Capterra.in, Reddit, LiveKit community, Play Store (Ameyo app) | monthly |
| TRAI submissions and positions | TRAI consultation responses (consent, 1600, A2P) | on each consultation |
| Partner integrations | ElevenLabs, Retell, Bolna, Sarvam guides on docs.exotel.com | monthly |
| Account-phase items still open | EXO-P01..P14, handset reply gap, first-ring time, bot-path AMD/DNC defaults | when the owner decides the sign-up question (EXO-V06 process conflict) |
Re-open triggers (from the graph reverse_if): Exotel publishes self-serve per-minute VoiceBot pricing with same-day activation; bot campaigns inherit ECC DNC/windows/AMD by default; a live battery shows its default turn-taking matches VP's.
