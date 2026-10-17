<!-- Recovered 2026-10-17 by the coordinator: the subagent harness refused this Write; content is the agent's own text, unchanged. -->

# Lane l4a-competitors: the voice-AI agent market for Indian buyers (H4, desk side)

Date: 2026-10-17. Author: research lane l4a (desk). Azure spend: INR 0 (no paid calls). This lane reads; it does not
measure competitor calls. Latency, barge-in and short-answer claims below are vendor statements or user reports,
never our measurements, unless a row says "measured". The measured battery belongs to the competitor-bench lane.

Files in this folder:

| file | what it is |
|---|---|
| `parity.csv` / `parity-wide.csv` | 24 features × 23 vendors, each cell yes / partial / no / unknown with evidence and source URL (long form has 552 rows) |
| `pricing-history.json` | 46 dated price observations for 16 vendors (Common Crawl captures from 2024-06 to 2026-09, plus live pages read 2026-10-17), with INR at ₹88/USD |
| `complaints.csv` | 869 complaint items: 56 hand-coded review and forum complaints, 688 Retell community support-thread titles, 125 Bolna GitHub issue titles |
| `complaint-taxonomy.csv` | counts per complaint code for each of the three blocks |
| `data/company-financials.csv` | funding, valuation, MCA-derived revenue and headcount for 21 companies |
| `data/cc-capture-index.csv` | every Common Crawl lookup: 380 URL × crawl lookups, 92 page captures retrieved |
| `data/docs-index-scan.json` | feature-keyword hits across 16 vendor docs indexes (`llms.txt`) |
| `data/bolna-github-issues.tsv` | 125 Bolna issue titles with dates |
| `code/*.py` | `cc_history.py` (Wayback substitute), `parity_scan.py`, `taxonomy.py`, `build_*.py`. All outputs can be regenerated from these scripts |

---

## 1. Answer to the hypothesis

**H4: incumbents fail Indian buyers in ways we can measure.** The desk evidence supports a narrower and sharper
version of H4. Six findings:

1. **Incumbents do not fail on headline features.** Across the 12 platforms read in depth, the basics are all
   documented: outbound campaigns, inbound, transfer, knowledge base, tools, post-call extraction and analytics
   (10–12 of 12 each; `parity.csv`). A feature-count pitch will not win.
2. **They fail on India-specific operating plumbing.** We scanned the docs indexes of 16 vendors (about 3,500 page
   entries). The terms DND, DLT, TRAI and NCPR appear in one index: Sarvam's. That page describes a suppression
   list the customer maintains, and it states that "calling compliance is your responsibility". Bolna documents
   the 140/160-series and DLT steps, but the customer performs them on the Tata DLT portal for a ₹5,900 fee.
   Only SquadStack (managed service, enterprise customers) and Ravan.ai claim NCPR scrubbing. Both are marketing
   claims, not documented.
3. **Nobody ships three of the owner's differentiators.**
   - *Self-learning:* no platform documents automatic optimisation (0 of 12 have it). Five offer A/B traffic
     splits; Ringg is the only Indian one.
   - *Dialects:* no platform offers dialect selection or matching (0 of 12). Gnani, Sarvam and Ravan claim
     "dialects" only in marketing copy.
   - *Cross-call memory:* only three US platforms document per-contact memory (Retell, Bland, Synthflow). No
     Indian platform does.
4. **Production complaints are about plumbing and service, not voice quality.**
   - In 688 Retell support threads, the leading code is telephony (numbers, SIP, transfers, international
     calling: 226, or 33%). Tool and integration issues follow (103), then account/UI (99) and billing (67).
     ASR, TTS, turn-taking and latency together make up 108.
   - On review sites (56 complaints across 8 vendors), support (18) and billing (13) lead.
   - India-specific threads repeat four problems: Indian numbers, +91 transfers, Hindi digits, and requests for
     Indian providers such as Sarvam.
5. **Price has already compressed to a band a new entrant cannot undercut.**
   - Posted Indian prices are ₹3.0–6.0 per connected minute: Sarvam ₹3.00–3.50 plus ₹0.40 telephony, Ringg ₹6
     all-in, Bolna about ₹5.3–5.5 plus telephony, MyOperator ₹5, SquadStack ₹2–5.
   - At the self-serve tier these prices fell 40–66% in a year (Ringg $0.20 → ₹6; Bolna $0.10 → $0.06).
   - A telecaller costs a median ₹8.86 per connected minute (l2 lane, n = 1,234 Apna postings).
   - US platforms on Indian telephony land at about ₹8–17/min. That is at or above the cost of a human minute,
     so they lose Indian B2C on price.
   - Only one source puts Bolna's committed-volume enterprise price at ₹1.75–2, and it is low confidence.
6. **The Indian mid-market falls between two models.** Enterprise-first vendors sell through sales teams with
   floors: Gnani (200+ enterprises), SquadStack (60+ brands, setup fee per use case), Sarvam Enterprise (from
   2 lakh min/month) and Synthflow (from $30k a year). Developer-first PAYG platforms (Bolna, Ringg, Smallest,
   Vapi, Retell) expect the buyer to build, integrate and carry compliance. Bolna's four Trustpilot reviews
   (2026) all report undelivered pilots, demos never called back, or refunds not processed. That is evidence of
   service-capacity strain at the fastest-growing Indian PAYG player. It is a small sample.

**Implication for the wedge.** A cheaper or more natural voice API is not a wedge on this evidence. The open space
is a **managed, compliance-carrying, outcome-measured calling service for Indian mid-market B2C**. It would combine:

- NCPR scrubbing, DLT and 140/160 registration, consent records and calling-hour enforcement as product;
- Indian telephony bundled in;
- voice and WhatsApp in one flow;
- per-contact memory;
- a learning loop with a measured A/A noise floor.

It should be priced against the telecaller's cost per outcome rather than per minute. This must still pass the
measured battery (latency and short answers) and the regulation lane's use-case map before it can be defended.

## 2. Prediction check against predictions.md

H4 prediction (prior 0.60): *"Measured incumbents show p50 response latency ≥ 1.0 s on Hinglish, mishandle short
answers ("haan", "ok") and interruptions, and none offers dialect-matched voices beyond the major languages. US
platforms cost $0.07–0.15 per minute all-in; Indian platforms ₹3–8 per minute."*

| part | outcome | why |
|---|---|---|
| p50 ≥ 1.0 s on Hinglish | untestable from desk; weakly supported by user reports | Vendors claim 200–600 ms: Gnani <200 ms P95, Bolna and Ravan <300 ms, Ringg <400 ms, Sarvam and Vapi <500 ms, Retell ~600 ms. Users report multi-second turns: on the Vapi forum the dashboard shows 575–1,000 ms but live calls take 3–4 s and sometimes 6–7 s; a Vapi Trustpilot review (2026-03) describes a 3–5 s pause after each turn; a Retell thread reports 3,000 ms; Bolna issue #235 reports 4 s. Our harvest measured Voice Live S2S first audio at 1.9 s p50 and a tool-using agent lane at 4–5 s (tx-voice). Not one of these is a measurement on a competitor. |
| mishandles short answers / interruptions | untestable from desk; design evidence supports it for Bolna | Bolna's open-source stop-word list (`ACCIDENTAL_INTERRUPTION_PHRASES`) and filler list are English-only, with no "ruko", "ek minute", "bas" or "haan". The interruption threshold is a word count. The language-switch prompt explicitly treats "haan" and "हाँ" as acoustically confusable. Turn-taking accounts for 27 of 688 Retell threads and 14 of 125 Bolna issues. |
| no dialect-matched voices | **supported** | 0 of 12 platforms document dialect selection. "Dialects" appears only as model-coverage marketing (Gnani, Sarvam, Ravan). |
| US platforms $0.07–0.15 all-in | **partly refuted** | US-telephony list prices: Retell $0.07–0.31 (calculator example $0.11), Vapi calculator $0.082–0.129, Bland $0.11–0.14 plus telephony, ElevenLabs $0.08 plus LLM and telephony, Synthflow PAYG $0.15–0.24 (now enterprise-only). For Indian calls, Twilio India adds $0.05–0.07/min (l2), so the realistic range is about $0.09–0.38. The upper bound in the prediction is too low. |
| Indian platforms ₹3–8 | **supported, with outliers** | Sarvam ₹3.40–3.90 all-in, Ringg ₹6, Bolna about ₹5.5 plus telephony, MyOperator ₹5, SquadStack ₹2–5, Ravan $0.04–0.10 (₹3.5–8.8). Outliers above the band: Smallest PAYG $0.09–0.21 (₹7.9–18.5) and VoiceGenie $0.20 (₹17.6). Low-confidence enterprise reports go below it (Bolna ₹1.75–2). |

Overall: **mixed**. The pricing and dialect parts held. The behavioural parts, which carry most of the weight,
await measurement.

## 3. Market map: who sells what

Indian platforms and incumbents. Sources are in `data/company-financials.csv` and `pricing-history.json`;
revenue figures are Inc42 Datalabs (compiled from MCA filings) or press citing RoC filings.

| vendor | what they sell / ICP | named customers (vendor-stated) | languages (claimed) | posted price (2026-10-17) | money (latest) |
|---|---|---|---|---|---|
| **Bolna** (BLR, 2024, YC F2025) | Developer-first orchestration on an open-source core; PAYG self-serve plus enterprise | 1,050 paying customers, 200k calls/day (Jan 2026 claim) | 10+ Indian languages, Hinglish | 6.0¢/min (₹5.52) PAYG, ~4.2–4.5¢ at volume; telephony and platform fee extra | Seed $6.3M (General Catalyst, 2026-01-20); ~₹50 lakh/month revenue (Inc42, Jan 2026); 51 staff (+6% in 90 days) |
| **Sarvam Samvaad** (BLR, 2023) | Full-stack sovereign AI; managed voice agents opened to self-serve in 2026 | Tata Capital | 11 Indian + English (22 for APIs) | ₹3.00–3.50/min (60-s pulse) + ₹0.40 telephony; Business tier ₹50k/month; Enterprise ≥2 lakh min/month | Series B first close $234M at $1.5B (Jun 2026); FY25 revenue ₹29.1 Cr, loss ₹102.4 Cr; 458 staff (+14%) |
| **Gnani.ai / Inya** (BLR, 2016) | Enterprise BFSI and contact centre; own STT/TTS/S2S models; on-prem and air-gapped | Equitas SFB, Bank of Baroda, Fibe, Crompton, Teleperformance, Concentrix (logos) | "40+ languages and dialects" | not published | Series B $10M first close (Mar 2026); FY25 revenue ₹53.9–57.0 Cr, profit ₹3.2 Cr; 326 staff (+15%) |
| **Smallest.ai Atoms** (SF/BLR, 2023) | Own Lightning TTS and Pulse STT plus agent platform; US and India | Pocket ("$100M ARR in 7 months", vendor claim) | 38 STT / 70+ TTS | $0.09–0.21 PAYG all-in; enterprise from $0.05 | Seed $8M (Oct 2025) + Series A $13M (Jul 2026); India-entity FY25 revenue ₹93 lakh; 104 staff (−1%) |
| **Ringg AI** (BLR, 2023) | Self-serve plus enterprise voice, WhatsApp and browser agents; proprietary Parrot STT | CRED, PharmEasy, Shiprocket, Flipkart, Shell | 20+ (10 Indian) | ₹6/connected min all-in; number ₹499/month; monthly minimum (amount not stated) | Series A $15.5M (Arkam + Peak XV, Jan and Aug 2026); FY25 revenue ₹90.5 lakh; 49 staff (+29%) |
| **Ravan.ai / "Agni"** | Emotion-aware S2S; India phone demo; SMB plans | none named | "100+ languages & dialects" (pricing page says 40+) | $29–497/month plans at $0.10–0.04/min; enterprise $0.02–0.04 | no funding found |
| **SquadStack** (Noida, 2015) | Human plus AI telecalling, now sold as voice AI with human hand-off; Arth ASR | Kotak, AngelOne, IIFL, TATA AIG, Flipkart, Swiggy, IndiaMART, Delhivery and others | 9 Indian languages | ₹2–5/min of live conversation incl. dialler and telephony; one-time setup per use case | $24.6M raised; FY24 revenue ₹26.5 Cr (half of FY23's ₹53.0 Cr), loss ₹46.3 Cr; 851 staff |
| **Subverse AI** (BLR, 2023) | BFSI voice, WhatsApp and email agents | none named | — | $0.08/min (Sep 2025); pricing page now 404 | FY25 revenue ₹6.8 lakh |
| **VoiceGenie** (Ori Labs / Oriserve) | SMB AI calling agent | "1,200+ teams" | 50+ | $0.20/min (unchanged since Jun 2024) | — |
| **MyOperator** | Cloud telephony suite plus AI voice agent add-on | — | — | AI Agent–Voice ₹10,000/month for 2,000 min (₹5/min), annual billing | — |
| **Exotel** (BLR, 2011) | CPaaS / contact centre; AI voice agents; claims sub-300 ms and a "Memory Layer" | 3,500+ businesses (claim) | — | quote-based (credit plans from ₹9,999 in 2024) | FY25 operating revenue ₹490.5 Cr, profit ₹20 Cr (RoC via Entrackr/MediaNama); 749 staff |
| **Ozonetel** (HYD, 2007) | Contact-centre suite with AI agents for renewals and collections; 24 vernacular languages | 3,500+ (claim) | 24 | quote-based | FY24 revenue ₹110.3 Cr, loss ₹7.1 Cr; 358 staff |
| **Haptik** (Jio) | Enterprise conversational AI incl. voice | Kotak Life (testimonial) | 100+ | quote | FY24 revenue ₹156.6 Cr, profit ₹11.2 Cr (Inc42); FY25 ₹231 Cr (low confidence) |
| **Yellow.ai** | Enterprise agentic CX; VOX voice agents | Lion Parcel and others | "500+" | quote | FY25 revenue ₹235.9 Cr (flat); 100+ layoffs (Inc42); 869 staff |
| **Skit.ai** | Now US collections (FDCPA/TCPA) with India collections case studies | Pollack & Rosen (US) | Hindi, English, regional | quote | ~$23M raised; 115 layoffs (Jan 2023); ~$1.5M revenue in 2023 (Preqin) |
| **Uniphore** | Global enterprise "Business AI cloud" | 60+ Fortune 500 (claim) | — | quote | $913.6M raised; India entity FY24 revenue ₹194.2 Cr |
| **Convin** | Contact-centre QA plus AI phone calls; US home-services copy | — | — | quote | $8.9M raised; FY24 revenue ₹9.1 Cr; 124 staff (−12% in 90 days) |

**New entrants and consolidation in 2025–2026:**

- Arrowhead: $3M seed (Stellaris), BFSI sales. Claims +45% conversion in one health-insurance deployment.
- BlueMachines.ai: Apna.co's enterprise voice unit (Oct 2025). Claims more than $6M in contracts within 45 days.
- Nurix AI (Mukesh Bansal) acquired Verloop.io on 2026-07-10.
- Navana: Series A, 2026-09.
- Smaller players: Vaani Research ($400k pre-seed), VoiceOwl (Indore), Dialflo, Alchemic, Caller Digital,
  Edesy, Vomyra.

Tracxn's "Voice AI startups in India" list (updated 2026-10-01) counts only 30 companies with $87.1M raised. It
leaves out Bolna, Sarvam and Smallest, so treat it as a narrow taxonomy rather than a census.

**Global platforms Indian buyers evaluate:**

| vendor | position | price (2026-10-17) | money | India-relevant limits |
|---|---|---|---|---|
| **Vapi** | Developer orchestration | $0.05/min platform + models + telephony (calculator $0.082–0.129); Pro has a $999/month minimum | Series B $50M (Peak XV, May 2026), ~$500M valuation reported; 1B calls processed | no India region; WhatsApp not documented; HN user: platform fee was 60–70% of their spend |
| **Retell** | Polished build-and-ship platform | $0.07–0.31 (infra $0.055 + TTS $0.015–0.10 + LLM + telephony $0.015); paid add-ons | ~$5M raised; ARR claims $50–60M (secondary) | Retell-managed numbers US/CA only; forum threads on Indian numbers and Hindi digits |
| **Bland** | High-volume outbound with its own models | $0.14 / $0.12 + $299/month; telephony extra | — | 40+ languages claimed; no Indic claim |
| **Synthflow** | No-code for agencies, now enterprise | enterprise-only from $30,000/year (since Sep 2026) | — | regional data residency for LATAM and DACH only |
| **ElevenLabs Agents** | Best-in-class TTS plus agent platform | $0.08/min (burst $0.16) + LLM/telephony | Series D $500M at $11B (Feb 2026); ARR above $500M (Apr 2026, company) | strong voices; campaign control plane thin (2026-09-22 review) |
| **PolyAI** | Enterprise inbound customer service (UK/US) | quote | — | docs host unreachable from the sandbox (502) |
| **Hume EVI** | Emotion-aware S2S substrate | no price on the page | — | substrate, not a calling platform |
| **LiveKit / Cartesia / OpenAI Realtime** | Substrates | LiveKit example $0.048/min all-in on US telephony; Retell resells GPT Realtime 2.1 at $0.38/min | — | build-it-yourself |
| **Sierra / Decagon** | Enterprise customer-experience agents at US enterprise price points | quote | — | not seen in Indian mid-market evidence; listed for completeness, not researched further |

## 4. Bolna's open-source core: what is built and what is hard-coded

Read from `bolna-ai/bolna` at HEAD `8e300d9` (2026-10-16, MIT licence). The repo has 332 files, about 79.6k lines
of Python and 174 test files. About 696 commits are reachable since 2026-01-02.

- **Architecture.** A websocket orchestrator chains input handler → transcriber → LLM agent → synthesizer →
  output handler.
  - `agent_manager/task_manager.py` is a 9,766-line god object. Issue #187 ("Breakdown task_manager") has been
    open since May 2025.
  - Agent types: contextual, graph, knowledge base, extraction, summarisation, webhook.
  - Speech-to-speech goes through OpenAI Realtime and Gemini Live.
- **Providers.**
  - Telephony: Twilio, Exotel, Plivo, Vobiz, SIP trunk, FreeSWITCH.
  - 15 TTS providers: Polly, ElevenLabs (incl. v3 dialogue), OpenAI, Deepgram, Azure, Cartesia, Smallest,
    Sarvam, Rime, Pixa, Maya, Kalpa, Gemini, Soniox, plus custom.
  - 13 ASR providers. One of them is `bolna`, a `RealtimeTranscriber` whose default model is
    **`nemotron-asr-hi`**. That suggests a self-hosted NVIDIA Nemotron Hindi ASR behind the OpenAI Realtime
    protocol.
  - Language identification via Sarvam and Soniox.
  - LLMs via OpenAI, Azure, Gemini and LiteLLM (Groq, Anthropic, DeepSeek, OpenRouter and others).
- **Hard-coded and India-relevant.**
  - English-only lists: `ACCIDENTAL_INTERRUPTION_PHRASES` ("stop", "wait", "hold on"…) and `FILLER_PHRASES`.
  - `PRE_FUNCTION_CALL_MESSAGE` exists only in en/de, and `TRANSFERING_CALL_FILLER` only in en/fr.
  - `DEFAULT_TIMEZONE = "America/Los_Angeles"`.
  - The check-in line "Hey, are you still there?" is English.
  - Interruptions trigger on a word count (`number_of_words_for_interruption` defaults to 1 in the conversation
    config and 3 in `InterruptionManager`), with a 900 ms incremental delay.
  - Deepgram Flux end-of-turn threshold is 0.7.
- **Voicemail detection is an LLM over the transcript.** It runs every 7 s for up to 30 s, using `gpt-4.1-mini`
  by default. It is not acoustic answering-machine detection: it waits for words, and it bills the minutes
  meanwhile.
- **Code-switching is a prompt.** The language-switch decision is an LLM judgement of the "matrix language"
  (`prompts.py`), with careful rules for "haan", "achha" and "हाँ". Bolna takes Hinglish seriously, and solves it
  at the prompt layer rather than the acoustic layer.
- **Absent from the open-source core:** DND/DLT/consent logic (a grep finds nothing), cross-call memory
  (`memory/` holds only an in-memory scalar cache; issue #1078 "MemCode recall" is open), and A/B or learning
  loops.
- **Code health (issue titles, n = 125).** Recent titles show:
  - silent multilingual calls after a TTS reconnect (#1092);
  - "India Routing showing Black despite active Vobiz number — No audio" (#614);
  - recordings crashing on missing torch imports (#1000);
  - call-breaking exceptions swallowed in `finally` (#896);
  - graph agents silently falling back to OpenAI (#902).

  Coded issues: tools/integration 25, reliability 15, ASR 14, turn-taking 14, TTS 13.

**Read-across for us:**

- The hosted Bolna is ahead of its open-source core (dashboard, workflows and residency are closed source). The
  core is a fair map of what an India-tuned cascade must handle, but it is not a reusable foundation for an
  Azure-only build.
- Its gaps (English-only barge-in vocabulary, transcript-based voicemail detection, no memory, no compliance
  layer) line up with the product thesis in section 7.

## 5. Pricing history (Wayback substitute) and price anchors

**Method.** Wayback CDX and archive.ph were blocked from the sandbox (connection reset; CAPTCHA). Instead we
binary-searched Common Crawl's `cluster.idx` with HTTP range requests on `data.commoncrawl.org`, then pulled the
WARC record for each capture (`code/cc_history.py`). That covers 32 pricing URLs × 12 crawls
(2023-50 … 2026-39) and yielded 92 captures (`data/cc-capture-index.csv`).

Pages rendered client-side (Vapi's 2025 pricing page, Exotel since 2025) have no prices in the HTML. For Vapi we
used its docs pricing page instead.

| vendor | trajectory | change |
|---|---|---|
| Ringg | $0.20 (2025-09) → $0.10 (2026-03) → ₹6 (2026-09) PAYG; enterprise $0.08 → $0.06 | ₹17.6 → ₹6 = **−66% in 12 months** |
| Bolna | bundles $0.10 → $0.05 (2025-12) → monthly plans 7¢/6¢/5¢ (2026-03) → PAYG 6¢, tiers to 4.5¢ (2026-06 onward) | −40% at the entry tier in 6 months |
| Smallest Atoms | $0.08 (2025-03) → India ~$0.20/$0.09/$0.07 by plan (2025-06…12) → PAYG $0.09–0.21, enterprise $0.05 (2026-10) | plan structure churned three times in 18 months |
| Synthflow | $29–1,400 subscriptions, $0.13 overage (2024-12) → PAYG $0.15–0.24 (2026-03) → **enterprise-only from $30k/year** (2026-09) | moved up-market |
| Vapi | 5¢/min platform (2024-06) → 5¢ (2026-10) | flat for 28 months |
| Retell | $0.07–0.31 headline (2024-12) → same (2026-10); premium voices unbundled | flat headline |
| VoiceGenie | $0.17–0.20 (2024-06) → $0.20 (2026-10) | flat |
| Bland | $0.14 / $0.12 / $0.11 (2026-06) → $0.14 / $0.12 (2026-10) | Scale tier removed |
| Sarvam APIs | Bulbul v3 TTS ₹30/10k chars, STT ₹30/hour (2026-03, 2026-06) → Bulbul v4 Flash ₹17–20/10k chars, STT ₹24.6–29.4/hour (2026-10, l2) | TTS −33% to −43% |

**Price anchors a buyer will bring (2026-10):**

- **Per minute:**
  - Indian self-serve: ₹3.4 (Sarvam, all-in) to ₹6 (Ringg, all-in); Bolna about ₹5.5 plus telephony.
  - Managed: SquadStack ₹2–5 including telephony.
  - US platforms on Indian telephony: about ₹8–17.
  - Human telecaller: ₹6.6 / 8.9 / 12.2 per connected minute at p10 / p50 / p90 (l2).
- **Monthly floors:**
  - MyOperator AI voice: ₹10,000/month (annual).
  - Sarvam Business: ₹50,000/month (returned as credits).
  - Sarvam Enterprise: from 2 lakh min/month, about ₹6 lakh/month at ₹3.
  - Bolna's Mar 2026 monthly plans ran $350–2,500 (₹31k–2.2 lakh) before they were withdrawn.
  - Vapi Pro: $999/month minimum. Synthflow: $30k/year.
- **Setup:** SquadStack charges a one-time fee per use case. Smallest charged $2,000 per extra custom agent in
  2025.
- **Per outcome:** no Indian vendor publishes a per-outcome price. SquadStack's FAQ says it "prices against
  outcomes", but its own pricing page offers none. The unit is open.

## 6. Complaints: what breaks in production

**Method.** Three blocks, all read on 2026-10-17:

- (a) 56 complaints hand-transcribed from Trustpilot (via WebFetch), Hacker News (Algolia API), Capterra (Exotel)
  and vendor forum threads;
- (b) all 688 "Support Help" titles among the 900 most recently active Retell community topics (2025-08-14 …
  2026-10-15, via the Discourse JSON API);
- (c) 125 Bolna GitHub issue titles.

Blocks (b) and (c) were coded by `code/taxonomy.py`, a multi-label regex taxonomy. On a random sample of 40 Retell
titles, the codes matched hand-coding on 33 (82%); the misses were mostly titles left unclassified.

G2, Reddit, Product Hunt and the Vapi support forum were blocked (403 or 429) and are recorded as blocked.

| code | reviews and forum quotes (n=56) | Retell support titles (n=688) | Bolna issues (n=125) |
|---|---|---|---|
| TELEPHONY (numbers, SIP, transfers, carriers) | 10 | **226** | 10 |
| TOOLS_INTEGRATION | 0 | 103 | **25** |
| ACCOUNT_UI | 4 | 99 | 6 |
| BILLING | 13 | 67 | 1 |
| AGENT_BEHAVIOUR (flows, prompts, end_call) | 1 | 61 | 4 |
| RELIABILITY (generic errors) | 9 | 59 | 15 |
| ASR | 2 | 36 | 14 |
| VOICE_TTS | 2 | 31 | 13 |
| TURN_TAKING | 0 | 27 | 14 |
| SUPPORT | **18** | 20 | 0 |
| LANGUAGE | 4 | 22 | 4 |
| LATENCY | 6 | 14 | 5 |
| VOICEMAIL_IVR_DTMF | 1 | 17 | 0 |
| COMPLIANCE_DATA | 1 | 7 | 1 |
| SALES_DELIVERY (pilot or demo not delivered) | 4 | 0 | 0 |
| unclassified / question | 1 | 125 | 35 |

**How to read this:**

- Production pain is dominated by **telephony and integration plumbing** and by **support and billing trust**,
  not by voice naturalness.
- Rating volumes vary widely. Retell has 810 Trustpilot reviews at 4.9 (it solicits reviews); Synthflow 215 at
  4.1; Vapi 15 at 2.4; Bolna 4 at 2.6; Exotel 5 at 2.5 on Trustpilot but 69 at 4.3 on Capterra. Small negative
  samples are signals, not rates.
- **India-specific signals:**
  - Hindi agents fail to recognise spoken digits (Retell, 2026-05; the vendor blamed the ASR provider);
    "Agent is not switching language even on consumer's request" (20 posts).
  - Indian numbers, +91 transfers, Airtel caller ID and requests for Sarvam STT/TTS all appear in Retell
    threads.
  - Bolna: silent multilingual calls; an Indian Vobiz route with no audio.
  - Exotel (older Capterra reviews): "Not allowed for automated calls for COD verification", "no more option for
    voice hindi pronunciation".
- **Consumer-side signal:** a Bland-powered agent told a caller "she would find my address if I call back" (1★,
  2025-12). That is a reminder that disclosure and conduct guardrails are product features.
- **Self-reported (vendor surveys and claims), not verified:**
  - Twilio's India survey: 68% of consumers abandoned an AI agent that lacked context about them.
  - SquadStack: abrupt-disconnect rate of about 10%, down from about 40% in Jan 2025 (vendor figure).

## 7. Gaps in the market for Indian B2C mid-market

Ranked by strength of evidence × relevance to a first customer:

1. **Compliance as product.**
   - Evidence: in 16 vendor docs indexes, 1 page mentions DND, and it is customer-maintained. Bolna hands the
     DLT/140/160 process to the customer (₹5,900 Principal Entity fee, letter of authorisation, KYC). Sarvam's
     docs say compliance is "your responsibility".
   - Only SquadStack and Ravan claim NCPR scrubbing and calling-window enforcement.
   - Mid-market buyers cannot staff this work. The l1 lane's use-case map decides how valuable this is.
2. **A managed outcome service for buyers with no engineers.**
   - PAYG platforms assume a builder.
   - Enterprise vendors have floors: about ₹6 lakh/month at Sarvam Enterprise volumes, $30k/year at Synthflow,
     setup fees per use case at SquadStack.
   - Trustpilot complaints against Bolna (undelivered pilots, unanswered demos) show the self-serve leaders
     struggling to deliver hand-held service.
3. **Per-contact memory and relationship.** Documented only by US platforms (Retell contact memory, Bland contact
   memory, Synthflow memory stores). No Indian platform documents it. Bolna's open-source core has none, and its
   issue for it is open. Directly relevant to the owner's "relational" idea.
4. **Learning loops with honest statistics.** 0 of 12 platforms document automatic optimisation. Five have A/B
   splits; Ringg is the only Indian one. Exotel, Yellow.ai and Synthflow make claims ("every intervention trains
   the AI", "self-heal", "fine-tuning coming"). No vendor publishes how it guards against learning noise. That is
   where H7's power analysis becomes a product feature.
5. **Dialect and accent matching.** Nobody offers it as a control (0 of 12). It is claimed only as model
   coverage. Whether buyers or callers want it is H6's question.
6. **Voice + WhatsApp in one flow.** Native: Ringg and ElevenLabs (plus Synthflow among US platforms). Bolna
   offers it through an AiSensy beta node or make.com; Sarvam only at Enterprise. Indian B2C follow-up runs on
   WhatsApp.
7. **Indian telephony quality.** For global platforms this is the top failure class (33% of Retell support
   threads are telephony). Indian platforms bundle Vobiz, Plivo or Exotel, but issues persist (Bolna #614).
8. **India-specific turn-taking.** Bolna hard-codes English barge-in and filler vocabularies. The rest claim
   300–600 ms with no published Hinglish short-answer evidence. Measurable gap; not yet measured.

## 8. What would kill this lane's conclusions

- **Price wedge (already dead):** posted Indian prices of ₹3.4–6/min, falling 40–66% a year, sit within 1.5–3×
  of the l2 lane's modelled cost (about ₹2/min). A wedge built on undercutting price is not viable. This one is
  already triggered.
- **Compliance gap:** if the regulation lane (l1) shows that NCPR/DLT handling is commoditised at the telephony
  layer, for example by Vobiz, Plivo or Exotel doing it for every customer, the compliance-as-product gap shrinks
  to a feature. Test: ask two CPaaS providers whether they scrub NCPR for voice-AI outbound by default.
- **Managed-service gap:** if SquadStack or Sarvam publish a mid-market tier with monthly floors under ₹25k and
  compliance included, the managed-service gap closes.
- **Behaviour (H4 kill):** if the measured battery shows Sarvam or Ringg at ≤ 1.0 s p50 with correct "haan/ok"
  handling and barge-in at ≤ ₹4/min, the quality wedge moves (H4 kill condition). This lane cannot test that.
- **Memory:** if an Indian platform ships documented cross-call memory plus A/B within the next quarter, gaps 3
  and 4 erode. Watch the changelogs of Bolna (its MemCode issue is open) and Ringg (it is funding a "context
  graph").
- **Data quality:** if a deeper complaint sample (G2 exports, Reddit) shows voice quality rather than
  telephony and support as the top pain for Indian buyers, re-weight section 6.

## 9. Owner actions (need a human, a phone, OTP or payment)

1. **Sign up and get free credits to run the measured battery** (each needs email or phone OTP; do not exceed the
   free credits without approval):
   - Bolna: $5 credits, `platform.bolna.ai`.
   - Sarvam Voice Agents: self-serve, `sarvam.ai/products/voice-agents`; simulated test runs cost ₹2 each.
   - Ringg: `ringg.ai`; PAYG, monthly minimum not stated, so ask before paying.
   - Smallest Atoms: $10 credits.
   - Vapi and Retell: $5–10 credits.
   - ElevenLabs Agents: free tier, 15 min.

   For each, record the invoice line items for 10 identical test calls.
2. **Phone-only demo:** dial Ravan.ai's demo line, **+91 11 4056 6600** (from ravan.ai), with the scripted
   battery. Record both sides with consent from your own device.
3. **Mystery-shopper quotes:** request quotes from SquadStack, Gnani, Exotel and Ozonetel for one mid-market
   scenario: 20,000 outbound min/month, consented leads, Hindi/Hinglish. Use the founder's own identity, and do
   not impersonate. Ask each one:
   - per-minute price, setup fee, minimum commitment and pilot length;
   - whether they scrub NCPR and register DLT on the customer's behalf.
4. **Blocked sources:** export G2 reviews (Vapi, Retell, Bland, Synthflow, Yellow.ai, Haptik, Exotel, Ozonetel,
   SquadStack) and the top Reddit threads (r/AI_Agents, r/SaaS, r/developersIndia) from a normal browser. Drop
   them into `research-raw/l4a-competitors/manual/` to re-run `taxonomy.py`.
5. **MCA filings (paid):** a Tofler or MCA21 pull for Bolna (Indian entity), Ringg, Smallest (Indian entity),
   SquadStack FY25, Ozonetel FY25 and Convin FY25. Inc42 has only FY24 for several.
6. **Expert calls (section 6 of the brief):** one ex-employee of an Indian voice-AI vendor and one CPaaS
   salesperson. Ask whether DLT/NCPR handling is a sales blocker for voice-AI deals.

## 10. Open questions

- What does Bolna's hosted product charge as a "platform fee" on top of 6¢ when telephony is bundled? The pricing
  page states it is extra but gives no amount. The docs say $0.02/min under BYOK.
- Is Bolna's ₹1.75–2 enterprise rate real? (One secondary source; not in the TechCrunch text.)
- Do Sarvam and Ringg handle "haan", "hmm" and barge-in better than Bolna's English stop-list design suggests?
  Only measurement can say.
- Do CRM and WhatsApp incumbents ship first-party voice agents: LeadSquared, Zoho, Kylas, Gupshup, Interakt,
  AiSensy, WATI? One search (2026-10-17) found LeadSquared's AI agents are text ticket tools. Voice comes from
  integrators such as Caller Digital and Edesy. Not researched further in this lane.
- How much of SquadStack's FY24 revenue halving (₹53 Cr → ₹26.5 Cr) is a deliberate move from human seats to AI
  minutes, and what has that done to its margins? This is the closest analogue to a managed outcome service.
- Retell's 4.9 from 810 Trustpilot reviews versus a forum full of telephony threads: how much do solicited reviews
  inflate ratings across this category?

---

## Evidence table

All accessed 2026-10-17 unless stated. Methods: read-primary = vendor's own page, docs, code or filings; read-secondary = press or
aggregator; computed = our arithmetic; measured = our measurement (none in this lane except docs and complaint
coding).

| # | claim | source | date | method | confidence |
|---|---|---|---|---|---|
| 1 | Sarvam Samvaad: ₹3.50/3.25/3.15/3.00 per min by tier, 60-s pulse; telephony ₹0.20/30 s; Enterprise ≥2 lakh min/month | https://www.sarvam.ai/products/voice-agents/pricing | 2026-10-17 | read-primary | high |
| 2 | Ringg: ₹6 per connected min all-in (STT+TTS+LLM+telephony); history $0.20 (2025-09) → $0.10 (2026-03) → ₹6 (2026-09) | https://www.ringg.ai/pricing ; Common Crawl captures (data/cc-capture-index.csv) | 2025-09-08…2026-10-17 | read-primary | high |
| 3 | Bolna: 6.0¢ (₹5.52) PAYG, telephony and platform fee extra; history $0.10 → 5–7¢ → 6¢ | https://www.bolna.ai/pricing ; CC captures | 2025-12-08…2026-10-17 | read-primary | high |
| 4 | Vapi platform fee $0.05/min unchanged since Jun 2024; calculator $82–129 per 1,000 min | https://vapi.ai/pricing ; CC docs.vapi.ai/pricing 2024-06-23 | 2024-06…2026-10 | read-primary | high |
| 5 | Retell $0.07–0.31/min headline unchanged Dec 2024 → Oct 2026; infra $0.055, telephony $0.015 | https://www.retellai.com/pricing ; CC | 2024-12-06…2026-10-17 | read-primary | high |
| 6 | Synthflow moved to enterprise-only from $30,000/year (Sep 2026) after PAYG $0.15–0.24 (H1 2026) | https://synthflow.ai/pricing ; CC 2026-03-14, 2026-09-10 | 2026 | read-primary | high |
| 7 | Telecaller cost ₹8.86 per connected min (p50; p10 6.6, p90 12.2) | lanes/l2-economics/cost-model.json (Apna n=1,234) | 2026-10-17 | computed (l2) | medium |
| 8 | In 16 vendor docs indexes, DND/DLT/TRAI/NCPR terms appear only in Sarvam's, which describes a customer-maintained suppression list and says compliance is the customer's responsibility | data/docs-index-scan.json ; https://docs.sarvam.ai/voice-agents/deploy/campaigns/dnd | 2026-10-17 | measured (doc scan) + read-primary | high |
| 9 | Bolna: customer registers DLT as Principal Entity (₹5,900), 140-series via Vobiz / 160 via Plivo; calling guardrails off by default | https://www.bolna.ai/docs/obtaining-regulated-phone-numbers ; /outbound/calling-guardrails | 2026-10-17 | read-primary | high |
| 10 | SquadStack claims TRAI DND scrubbing, 9:30–20:30 window, consent gating, AI disclosure; ₹2–5/min incl. telephony | https://www.squadstack.ai/fully-managed-telecalling-for-sales-operations-teams | 2026-10-17 | vendor-claim | medium |
| 11 | 0 of 12 platforms document automatic optimisation or dialect selection; 3 (all US) document cross-call memory | parity.csv | 2026-10-17 | read-primary (docs) | medium (absence ≠ non-existence) |
| 12 | Retell support threads: telephony is the top code (226/688 = 33%) | complaints.csv ; community.retellai.com/latest.json | 2025-08…2026-10 | measured (title coding, 82% agreement) | medium |
| 13 | Review-site complaints led by support (18/56) and billing (13/56) | complaints.csv (Trustpilot, Capterra, HN) | 2024–2026 | read-primary, hand-coded | medium |
| 14 | Bolna open-source core hard-codes English-only barge-in and filler lists, LA timezone, transcript-LLM voicemail detection; no DND/memory code | github.com/bolna-ai/bolna @8e300d9 `bolna/constants.py`, `agent_manager/voicemail_handler.py` | 2026-10-16 | read-primary (code) | high |
| 15 | Bolna: $6.3M seed (GC), ~₹50 lakh/month revenue, 1,050 paying customers (company figures) | techcrunch.com/2026/01/20/… ; inc42.com/?p=545778 | 2026-01-20 | read-secondary | medium |
| 16 | Sarvam FY25 revenue ₹29.1 Cr, loss ₹102.4 Cr; Series B first close $234M at $1.5B | inc42.com/company/sarvam-ai/financials ; exchange4media 2026-06-16 | 2026 | read-secondary (MCA via Inc42) | medium |
| 17 | Gnani FY25 revenue ₹53.9–57.0 Cr, profitable; Ringg FY25 ₹0.9 Cr; Smallest India entity ₹0.93 Cr | inc42 company pages | 2026-10-17 | read-secondary | medium |
| 18 | Exotel FY25 operating revenue ₹490.5 Cr, profit ₹20 Cr | entrackr.com/fintrackr/exotel-turns-profitable-in-fy25… ; medianama 2026-01 | 2026-01 | read-secondary (RoC) | high |
| 19 | SquadStack FY24 revenue ₹26.5 Cr, half of FY23's ₹53.0 Cr; loss ₹46.3 Cr | inc42.com/company/squadstack/financials | 2026-10-17 | read-secondary | medium |
| 20 | Vapi $50M Series B (Peak XV), ~$500M valuation reported, 1B calls | techcrunch.com/2026/05/12/vapi-hits-500m-valuation… | 2026-05-12 | read-secondary | medium |
| 21 | ElevenLabs $500M Series D at $11B; ARR >$500M | pulse2.com ; cxodigitalpulse | 2026-02…04 | read-secondary | medium |
| 22 | Vendor latency claims: Gnani <200 ms P95; Bolna, Ravan, Exotel <300 ms; Ringg <400 ms; Sarvam, Vapi <500 ms; Retell ~600 ms | vendor homepages (curl) | 2026-10-17 | vendor-claim | low (as performance) |
| 23 | User reports of 3–7 s live latency on Vapi; 3,000 ms on Retell; 4 s on Bolna | support.vapi.ai/t/23432400 (search excerpt); Trustpilot Vapi 2026-03-05; community.retellai.com/t/591; Bolna #235 | 2025–2026 | read-primary (user reports) | low-medium |
| 24 | Nurix AI acquired Verloop.io (2026-07-10); Arrowhead $3M seed; BlueMachines >$6M contracts in 45 days (claim) | inc42.com/buzz/mukesh-bansals-nurix-ai-to-acquire-verloop ; entrackr snippets | 2025-10…2026-07 | read-secondary | medium |
| 25 | Ravan.ai lists a +91 phone demo and claims NCPR scrubbing; plans $0.10–0.04/min | https://www.ravan.ai ; /pricing | 2026-10-17 | vendor-claim | medium |
| 26 | Bolna Trustpilot: 4 reviews, 2.6, all 1★ about support, refunds and undelivered pilots | https://www.trustpilot.com/review/bolna.ai | 2026-01…05 | read-primary | low (n=4) |

**Contradictions kept rather than smoothed:**

- Exotel FY25 revenue: ₹490.5 Cr operating (Entrackr) vs ₹475.0 Cr (Inc42 profile). EBITDA: ₹34 Cr (company) vs
  ₹50.2 Cr (Inc42).
- Gnani funding: $14M (Inc42) vs $21.9M (Tracxn). Revenue: ₹53.87 Cr (operating) vs ₹57.0 Cr.
- Yellow.ai: FY25 PAT +₹0.79 Cr (Inc42 FAQ) vs a ₹42.1 Cr loss in FY24.
- SquadStack: "prices against outcomes" (FAQ) vs no per-outcome pricing (pricing page). Pilot of 3–8 weeks (FAQ)
  vs a 90-day commitment (engagement section).
- Ravan: 100+ languages (hero) vs 40+ (plan).
- Bolna pricing page: says billing is token-based and also per minute.

## Measurements (this lane)

| measurement | n | method | date |
|---|---|---|---|
| Docs-index feature scan | 16 vendor `llms.txt` indexes (~3,500 entries), 24 feature regexes | `code/parity_scan.py` | 2026-10-17 |
| Complaint coding agreement | 40 random Retell titles; 33 matched hand-coding (82%) | hand review of `taxonomy.py` output | 2026-10-17 |
| Complaint taxonomy counts | 869 items (56 / 688 / 125) | `code/build_complaints.py` | 2026-10-17 |
| Price history | 92 Common Crawl captures across 32 URLs and 12 crawls; 46 dated observations kept | `code/cc_history.py`, `code/build_pricing_history.py` | 2026-10-17 |
| Bolna repo | 332 files, ~79.6k Python lines, 174 tests, task_manager 9,766 lines, ~696 commits since 2026-01-02 | `git` + `wc` on clone @8e300d9 | 2026-10-17 |

**Blocked sources:**

- Blocked outright: web.archive.org (connection reset / egress policy), archive.ph (CAPTCHA),
  index.commoncrawl.org (reset), G2 (403), Reddit (403), Product Hunt (403), openai.com pricing (403),
  polyai.com (expired TLS certificate), docs.polyai.com / developers.exotel.com / docs.squadstack.ai (502).
- Rate-limited: support.vapi.ai (429), pullpush (429).
- Unusable: tracxn.com loaded only partially (no JavaScript), and hume.ai pricing showed no prices.
