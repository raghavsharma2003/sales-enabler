# ElevenLabs Agents: public teardown (account-free), 2026-10-20

The subagent harness refused report.md ("Subagents should return findings as text"), so this summary is the report. The main loop should save it as research/2026-10-20/teardown/elevenlabs/report.md.

**Outputs written:**
- claims.json: 56 claims (44 observed, 9 inferred, 3 vendor-claimed).
- predictions.json: EL-P01 to EL-P12, pre-registered.
- pricing-allin.json, velocity.json, bundle-endpoints.json.
- manifest.csv: 3,809 raw files, 189 MB, all under data/teardown/elevenlabs/, each with sha256.
- context/inbox/teardown-elevenlabs.json: 12 nodes, 29 edges and 1 event, validated against scripts/lib/context-schema.mjs.

Nothing was committed or pushed, and context/graph.json was not edited.

Paths below are relative to the repo root. D/ = data/teardown/elevenlabs/, T/ = research/2026-10-20/teardown/elevenlabs/.

## Headline
ElevenLabs is not a TTS vendor with an agent added on. It owns almost the whole speech stack:
- ASR: Scribe Realtime.
- TTS: Eleven v4 Turbo.
- A turn-detection model (turn_v3).
- Two speech-to-speech models.
- RAG embeddings.

It runs that stack on its own LiveKit deployment on Google Cloud, and ships about 6 agent features a week.

**What it already has for India:** native Exotel (since 2026-06-01) and an India data-residency environment (Enterprise only).

**What it is building:** a lead-level outbound campaign product. It appears only in the signed-out dashboard bundle.

**Where it is weak for India.** The gaps are regional, not functional:
- A self-serve Indian buyer's SIP media is anchored in Iowa (us-central1).
- There are no Indian compliance controls at all.
- Hinglish support is claimed on the India page but absent from the docs.
- All-in list price is INR 8.2-8.9 per minute, about 2x Sarvam.

Its platform margin is about 82-97% (inferred), so a price cut would cost it little.

## 1. Product surface (EL-01..08)
The docs index lists 804 pages; we saved 258 as Markdown (D/docs/llms.txt).

**Documented surfaces:**
- **Builder:** prompt, visual workflows, free-form and structured procedures, knowledge base with RAG.
- **Tools:** client, webhook, code, MCP, and system tools (end call, language detection, agent and number transfer, skip turn, DTMF, voicemail detection, update state, flag issue).
- **Voice:** library, cloning, multi-voice, pronunciation dictionaries, expressive mode, audio environment.
- **Channels:** widget, SDKs for JS, React, React Native, Swift, Kotlin and Python, WebSocket, WhatsApp, SMS, Slack, Telegram, Teams, custom channel.
- **Telephony:** import a Twilio, Exotel or SIP-trunk number, plus Vonage and CCaaS integrations (Genesys, Five9, Amazon Connect). ElevenLabs sells no numbers.
- **Operate:** branches, merge proposals, environments, experiments, tests and simulations, analytics, Spotlight, real-time monitoring, alerts, triage tickets, OpenTelemetry, CLI, hosted MCP.
- **Privacy:** retention controls, redaction, Zero Retention Mode, HIPAA, EU/India/Singapore residency, private "enclave" deployments.
- **Billing:** six plans plus Enterprise, burst concurrency, queueing, INR and UPI checkout.

**Architect** is an LLM copilot (EL-03). It investigates, edits the agent on a branch, writes and runs tests, and opens a merge proposal. A person must merge, and it does no scheduled work yet.

**Reception.ai** is a separate SMB receptionist product (EL-04).

**Public outbound is batch calling only** (EL-05):
- CSV/XLS upload with a mandatory phone_number column.
- One start time plus a timezone.
- Per-recipient status, one retry endpoint, export.
- Zero Retention Mode cannot be used with batch calls.

**Hidden surface (EL-06..08, T/bundle-endpoints.json).** Of 568 convai routes in the signed-out dashboard bundle, 326 are absent from the public OpenAPI. They include:
- **outbound-campaigns** (23 routes): campaigns submit, pause, resume, stop, progress, calls and export; leads with suppressLead; an attention queue with resolve and retry; workspace config; pre-revoke-status.
- **memories:** /agents/{id}/memories and /agents/{id}/user-memory/preview.
- **automations** (with schedule-preview), task-agents and task-runs, company-oracle, templates, and analytics queries.

Conversation records already carry campaign_id, campaign_lead_id, cold_attempt and conversation_type (initial/retry/callback/redirect).

This contradicts, as a trajectory, the 2026-10-17 parity row `outbound_campaigns partial: no campaign control plane`. The row is still true of the public product.

## 2. Docs and API (EL-09..15)
**Size:** the OpenAPI has 322 paths and 1,644 schemas, of which 141 paths are /v1/convai.

**Data model:**
- There is no contacts or leads object. The person on the call is a `user_id` string, listed by /v1/convai/users.
- Phone numbers are import-only. TelephonyProvider = twilio, sip_trunk, exotel.

**Diagnostics on every conversation:**
- termination_reason, error {code, reason}, call_result (answered/voicemail/busy/no_answer/failed);
- SIP messages, queue_wait_secs, main_language;
- per-call cost and cost_fiat;
- 40 filter parameters.

**Defaults:**
- LLM gemini-2.5-flash, TTS eleven_v4_turbo, ASR scribe_realtime (default since 2026-06-08).
- turn_v3, turn_timeout 7 s, speculative turn off.

**LLM enum:** 111 values. OpenAI, Gemini, Claude and Grok, plus open models ElevenLabs hosts itself (Qwen, GLM, DeepSeek Flash, Nemotron NVFP4, Watt-tool). Custom LLMs are supported, and a backup cascade is on by default.

**Realtime speech-to-speech:** v1 Mini and Max, OpenAI-Realtime-compatible, rolling out per workspace. Max is not offered in India residency.

## 3. Architecture (EL-16..28)
- **Transport:** the client SDK (@elevenlabs/client 1.29.0, livekit-client ^2.21) defaults to WebRTC at wss://livekit.rtc.elevenlabs.io. The EU and India residencies have their own LiveKit hosts. Text and signed-URL sessions use WebSocket. (observed: D/sdk-npm-client/unpacked/package/dist/utils/location.js, ConnectionFactory.js)
- **LiveKit throughout the schema:** livekit_token, is_livekit, LivekitStackType, "LiveKit SIP outbound trunk". (observed)
- **Self-hosted LiveKit (inferred):** they run their own LiveKit and LiveKit SIP on their own GCP domains, not LiveKit Cloud, Pipecat or Vocode.
- **Front door:** all HTTP, WebSocket and LiveKit hosts sit in GCP "global" anycast load-balancer ranges, so their backend region is hidden.
- **SIP is regional (observed: DoH lookups matched to gcp-cloud.json):**
  - sip.rtc.elevenlabs.io → 136.112.48.140, GCP **us-central1**.
  - sip.rtc.in.residency.elevenlabs.io → **asia-south1** (Mumbai).
  - EU → europe-west1; SG → asia-southeast1.
  - The static-IP SIP block 199.88.252.0/24 is registered to Eleven Labs Inc (ARIN).
- **What that means for India (EL-21, inferred):**
  - A standard-plan Indian SIP call adds about one India-US round trip per turn (~200-250 ms; Azure Central India to East US is 201 ms, l8 E16).
  - It is also exposed to the TRAI rule that Indian SIP termination needs an Indian server (Plivo states this for Vapi).
  - Exotel's WebSocket path avoids the SIP problem, but its backend region is unknown.
- **One 25 s public demo call (EL-22):**
  - WebSocket to wss://api.elevenlabs.io/v1/convai/conversation, from react_sdk 0.14.0-beta.0.
  - pcm_44100 out, pcm_16000 in, server ping 216-223 ms from our US-East egress.
  - The first message has no AI disclosure.
- **Speech stack:** first-party (Scribe, v4 Turbo, turn_v3, e5 embeddings).
- **LLM routing (inferred):** Gemini and Claude are priced to "Vertex AI regional" rates, so they likely go through Vertex.
- **App plumbing:** Next.js/Turbopack, MobX, Firebase Auth, Stripe, hCaptcha, proxied PostHog, VWO, Clarity, Sentry, and a Cloud Function in project xi-labs (us-central1). The widget bundles FingerprintJS.
- **Job posts:** GCP, Kubernetes and GPU clusters "across cloud and on-prem"; vLLM, SGLang and Triton. India roles: AE Mid-Market, Account Manager, Deployment Strategist Lead (Bangalore).
- **Private "enclave" deployment** exists, with an optional Bedrock inference profile.

## 4. Pricing and COGS (EL-29..34, T/pricing-allin.json)
- **List price:** $0.08 per call minute on every plan.
  - Free 15 min / 4 concurrent.
  - Starter $6 / 75 min; Creator $22 / 275; Pro $99 / 1,238; Scale $299 / 3,738; Business $990 / 12,375 min and 40 concurrent.
  - Burst $0.16 (up to 3x concurrency). Text message $0.003. LLM passed through with no markup claimed. No telephony fee.
  - Silent stretches billed at 5% (vendor-claimed).
- **History:** unchanged in USD since 2026-06-06 and 2026-10-17 (l4a pricing-history.json). At FX 95 that is INR 7.60, up from INR 7.04 at FX 88.
- **All-in for an Indian outbound minute (inferred):**
  - INR 8.17-8.92 via Exotel or Plivo: platform 7.60 + LLM 0.19-0.72 + telephony 0.38-0.60.
  - INR 15.8-16.5 in burst.
  - INR 12.5-15.0 via Twilio.
  - That is about 2x Sarvam (INR 3.4-3.9).
- **The platform fee is 3.9x their own API list price** for the same ASR and TTS ($0.0206 a minute).
- **Reconstructed COGS:** INR 0.20-1.38 per minute, so an 82-97% gross margin (inferred from g4 GPU analogues). This reinforces rejected.2026-10-17.parity-undercut.
- **INR and UPI checkout** (vendor-claimed).

## 5. Velocity (EL-35..37)
- **Changelog:** 32 entries from 2026-04-01 to 2026-10-12. 296 headline items, 195 of them ElevenAgents (median 6 per entry). Vapi had 82 items in a similar window.
- **India-relevant launches:**

| Date | Launch |
|---|---|
| 06-01 | Exotel |
| 06-15 | memory tool types |
| 07-13 | backchannel flag |
| 07-27 | batch export |
| 08-17 | wait queues |
| 08-31 | batch campaign context |
| 09-07 | Twilio AMD |
| 09-21 | alerting |

- **SDKs:** JS and Python at 2.74.
- **Status (incident.io RSS, 75 days):** 25 incidents. 9 name Agents, SIP, Twilio, batch calling or history; 4 are SIP/Twilio; 5 are EU residency.

## 6. India plumbing (EL-38..44)
**What ElevenLabs provides:**
- **Exotel, first-class.** The Voicebot applet streams 8 kHz PCM over WebSocket; Mumbai and Singapore clusters. The Voicebot is gated by Exotel support (1-2 business days), and transfer needs a chained Connect applet.
- **India residency, Enterprise only.** Storage is in India, but "processing may nevertheless occur outside". It is a separate workspace with no migration.
  - This **corrects** the 2026-10-17 parity row `on_prem_india_residency: no India region found`.
- **Indian languages.** ASR and TTS list 12 Indian languages. The language-detection tool is off by default.
- **India marketing page** (vendor-claimed): Hinglish tuning, Ozonetel, Exotel and Plivo integrations, Meesho, Cars24 and TVS logos, forward-deployed engineers. No benchmark is published.

**What it leaves to the buyer:**
- **No India compliance.** Zero mentions of TRAI, DLT, NCPR/DND, 140/160 series or Indian calling hours in 258 pages; the only telemarketing-law page is TCPA. The batch API has no window, DNC or consent field. This confirms ledger CMP-27.
- **AI disclosure and recording consent** are the buyer's contractual duty; nothing is injected.
- **Twilio regions** are only us1, ie1 and au1.

## 7. Failure modes (EL-45..50)
Reddit, G2 and GitHub's API/HTML returned 403 and were not bypassed. Trustpilot and GitHub issues were read through WebFetch (model summary, so the quotes may be lightly paraphrased).

1. **CONVERSATION (our own l4b measurement, 2026-10-17):**
   - Clean-turn p50 3.75 s; end-of-turn transcript 2.65 s.
   - Hindi callers answered in English.
   - "haan"/"hmm" answered with "Are you still there?" on 4 of 16 short turns.
   - Barge-in handled 3 of 7; a babble session slowed to 8 s and dropped.
2. **SUPPORT** (Trustpilot 3.0 / 1,192 reviews):
   - "routes to an AI agent that cannot resolve billing matters and does not transfer to a person" (2026-06-11);
   - "customer support? Non-existent" (2025-12-01);
   - WhatsApp failing, "emailing support 4 times" (2026-01-12).
3. **DOCS/UX:**
   - "brute force an agent at the dashboard and API to figure it out" (2026-10-06);
   - "needs to refresh the page" (2026-02-25).
4. **RELIABILITY:**
   - "the call unexpectedly drops out ... answers with no record of the previous conversation" (2026-06-17);
   - packages #635 (agent does not speak), #257 (first WebSocket connection fails), #336 (stuck listening);
   - 9 agent/telephony incidents in 75 days.
5. **BILLING:**
   - "charging me credits for the AI agent's mistakes" (2026-07-24);
   - Retell threads on ElevenLabs v3 billing and stutter.
6. **SALES-AGENT QUALITY:** HN 48088509: "Elevenlabs using a completely incapable voice agent for sales outreach..."

## 8. v2 notes (EL-51..54)
- **Memory across calls:**
  - No public docs.
  - Present in the schema: MemoryEntrySearchResult with version and a conversation or manual source; convai_memory_entries.
  - Present in the dashboard bundle: memories CRUD and user-memory preview.
  - So it is in development or private beta. The parity row `memory_across_calls: unknown` becomes "in development".
- **Personalisation is per call only:** dynamic variables, overrides, user_id.
- **The improvement loop is human-gated:**
  - Spotlight finds an issue, Architect builds a branch with tests, a teammate merges.
  - Experiments split deterministically and the winner is promoted by hand; no significance test is documented. This extends ledger LRN-09.
  - Automations and architect-dispatches are already in the bundle. It is a propose, test, compose loop like harness2's, with a person as the gate.
- **Marketing is ahead of the docs** on India and Hinglish, as in ledger CMP-01.

## What this means for the three decisions
**1. Pre-sale or post-sale first:**
- ElevenLabs gives an Indian buyer none of the promotional-call plumbing: no DLT or 140-series, no NCPR, no consent ledger, no IST windows.
- So the gap is largest where regulation is heaviest. That favours VP owning the compliance layer as product.
- But ElevenLabs' Indian logos are service-heavy, and its hidden campaigns product targets outbound in general.
- This lane does not settle the order on its own.

**2. Parity floor (must-be, against ElevenLabs).** ElevenLabs ships all of these:
- Exotel or Indian-SIP BYO numbers;
- CSV upload with per-row variables;
- scheduling;
- voicemail detection and transfer;
- per-call failure reason, SIP trace and cost;
- batch export;
- versioning and test calls;
- WhatsApp;
- 12 Indian languages.

Performance attributes: analytics and topic discovery, experiments, an LLM build-and-fix copilot. The campaign control plane (leads, retries, suppression, exception queue) is about to become table stakes.

**3. Where VP can be measurably better:**
- India-resident latency on every plan (EL-P08 predicts 2.0-3.2 s handset p50 for ElevenLabs on a standard plan).
- Hinglish language hold and backchannels (EL-P02, EL-P11).
- Compliance as product: IST windows, NCPR scrub, opt-out, consent, DLT (EL-P03, EL-P04).
- Indian failure reasons in plain language (EL-P05, EL-P06).
- One-file outcome export with extracted fields (EL-P07).

Price is not a durable wedge (82-97% margin). Do not compete on voice quality, which is ElevenLabs' strength.

## Method and boundaries
- **Fetching:** fetch.sh with a fetch log feeding the manifest. npm pack and pip download --no-deps, unpacked and never executed. python3 -I.
- **Passive captures** of /agents and /app/sign-in, with no login.
- **Bundle reading:** JS exported from the HAR and string-matched only.
- **One demo call** (attempts 1-3 started no session): the page's own Web call control plus its terms dialog, with a synthetic l4b clip.
- **DNS** via Cloudflare DoH, matched to GCP cloud.json and ARIN RDAP.
- **Not done:** no sign-up; no WebRTC token fetch (it would open a second session); no Phone-call demo; no Reddit or G2.

---

## Structured result (from the workflow run wf_560edf6c-5d6, public-material phase)

### Key findings

- ElevenLabs has an unreleased lead-level campaign product. The signed-out dashboard bundle carries 23 unpublished /v1/convai/outbound-campaigns routes: submit, pause, resume, stop, progress, export, leads with suppressLead, an attention queue with resolve and retry, and workspace config. Conversation records already carry campaign_id, campaign_lead_id, cold_attempt and conversation_type. In total, 326 of 568 convai routes in the bundle are missing from the public OpenAPI (observed, T/bundle-endpoints.json). The 2026-10-17 'no campaign control plane' parity row is true of today's public product but is likely to expire.
- India data residency exists, but only on Enterprise (in.residency.elevenlabs.io; storage in India, processing 'may occur outside'). This corrects the 2026-10-17 parity row 'no India region found'.
- SIP is regional, and DNS shows where. The default sip.rtc.elevenlabs.io is in GCP us-central1 (Iowa); the India-residency SIP host is in asia-south1 (Mumbai). The static-IP block 199.88.252.0/24 is registered to Eleven Labs Inc. Inference: a self-serve Indian SIP call adds about one India-US round trip (~200-250 ms) per turn, and runs into the TRAI rule that Indian SIP termination needs an Indian server.
- Exotel has been a first-class telephony provider since 2026-06-01. Its Voicebot applet streams 8 kHz PCM over WebSocket, and the Mumbai cluster is supported, which gives a domestic Indian CLI path that Vapi lacks. Friction: Exotel must first enable the gated Voicebot applet (1-2 business days), and transfer needs a chained Connect applet.
- Zero Indian compliance controls. Across 258 docs pages there is no mention of TRAI, DLT, NCPR/DND, the 140/160 series or IST calling hours; the only telemarketing-law page is TCPA. Batch calling offers one start time plus a timezone, with no window, DNC or consent field. AI disclosure is a contractual duty of the buyer. Confirms ledger CMP-27.
- Architecture. Orchestration is their own, and the speech stack is first-party: Scribe Realtime ASR, Eleven v4 Turbo TTS, the turn_v3 turn model, and Realtime v1 Mini/Max speech-to-speech. Browser voice defaults to WebRTC via a LiveKit they host themselves (livekit.rtc.*.elevenlabs.io); hosts sit behind GCP global load balancers. The LLM is third-party (default gemini-2.5-flash, likely via Vertex) or one of their self-hosted open models.
- Pricing. $0.08 per minute on every plan, unchanged in USD since June; burst $0.16; LLM billed separately; telephony is bring-your-own. All-in for an Indian outbound minute: INR 8.17-8.92 via Exotel or Plivo, INR 12.5-15.0 via Twilio, about 2x Sarvam. The platform fee is 3.9x what the same ASR and TTS cost on ElevenLabs' own API list; reconstructed COGS of INR 0.20-1.38/min implies an 82-97% margin (inferred).
- Velocity. 195 ElevenAgents changelog items in 32 weekly entries from April to October 2026, a median of 6 per week (Vapi had 82 items in a similar window). Reliability: 25 status incidents in 75 days, 9 involving Agents or telephony (4 SIP/Twilio).
- v2. Cross-call memory is in development: memory entry schemas exist, and the dashboard calls /agents/{id}/memories and /user-memory/preview, but nothing is documented. The improvement loop is human-gated (Spotlight, then Architect on a branch with tests, then a merge proposal; experiments are promoted by hand). Automations and architect-dispatches already sit in the bundle.
- Failure modes. Our own 2026-10-17 measurements are the strongest evidence: 3.75 s p50, Hindi answered in English, 'haan' treated as absence. Review complaints cluster on SUPPORT ('AI agent that cannot resolve billing ... does not transfer to a person'), DOCS/UX, and dropped calls with no memory (Trustpilot 3.0 from 1,192 reviews). SDK connection bugs show up in elevenlabs/packages issues. Reddit and G2 were blocked (403) and not bypassed.

### Pre-registered predictions for the account phase

- EL-P01: a web call within 10 min of sign-up. A first Indian-handset call takes >= 30 min on the Twilio route and >= 1 business day on the Exotel route.
- EL-P02: a default English agent answers Hinglish turns in English >= 30% of the time. A Hindi agent needs three settings: language hi, a Hindi voice, and the language-detection tool.
- EL-P03: the batch CSV mishandles >= 3 of 5 messy categories. Duplicates are kept, the opt-out row is dialled, 10-digit numbers are not normalised to +91, and empty variables make calls fail.
- EL-P04: there is no calling-window control in public batch calling. Probability the hidden campaigns UI is visible to a new self-serve workspace: <= 30%.
- EL-P05: LLM voicemail detection mishandles >= 1 of 3 Indian operator announcements. Exotel transfer fails without a chained Connect applet. Twilio AMD does not work on Exotel or SIP.
- EL-P06: platform-side failure reasons are found in < 3 min. Indian carrier or regulatory failures appear only as generic failed or no_answer.
- EL-P07: the batch export lacks the extracted data-collection fields, which need a second API pull.
- EL-P08: handset reply gap on Indian PSTN on a standard plan is p50 2.0-3.2 s (n >= 30). India residency lowers it by >= 0.25 s.
- EL-P09: template agents do not disclose AI unprompted, and admit being AI in >= 9 of 10 'are you a bot?' trials.
- EL-P10: the invoice shows $0.08/min platform minutes, a separate LLM charge and no telephony fee, and cost_fiat is present on each conversation.
- EL-P11: >= 2 of 10 short Hindi backchannels ('haan'/'hmm') are mishandled on the default config.
- EL-P12: a second call to the same user_id has no recall of the first on default settings, and any memory control is behind a flag.

### Needs a trial account to learn

- Onboarding clock: minutes from sign-up to the first web call, and to the first call that rings our Indian handset, via a Twilio-imported number and via Exotel (the Voicebot applet must first be enabled by Exotel support). Is batch calling available on the Free plan? (EL-P01)
- The 50-row messy CSV run through batch calling, outcome per row: duplicates, 10-digit numbers without +91, Hindi-script names, empty columns, the opt-out row (EL-P03)
- Whether the hidden outbound-campaigns, memories, automations and Realtime-model surfaces are visible in a new self-serve workspace, and what the campaign workspace config holds: calling windows, retry policy, suppression, pre-revoke (EL-P04, EL-P12)
- Which region actually processes an Exotel WebSocket call and a Plivo SIP call on a standard plan. Then the handset reply gap with the l4b battery on our own Plivo/Exotel number (>= 30 clean turns, stereo), plus Hinglish language hold and 'haan'/'hmm' backchannel handling on the default configuration (EL-P02, EL-P08, EL-P11)
- Voicemail detection against Indian operator announcements (switched off, not reachable, busy, in Hindi), and transfer on the Exotel and SIP paths (EL-P05)
- The failure-reason text shown for carrier-side and regulatory failures (DND, CLI or DLT rejection) versus platform failures, and the columns in the batch export (EL-P06, EL-P07)
- Invoice line items for 10 identical calls: platform minutes, LLM, the silence discount, and cost_fiat per conversation (EL-P10)
- AI-disclosure behaviour of the default templates, Architect's quality on our standard agent (does it pass our tests), and real support response time (EL-P09)

### Run facts

- Claims: 56 {"observed": 44, "inferred": 9, "vendor_claimed": 3, "unknown": 0}
- REA used: True
- REA notes: REA 6.7.0 (npx rea-agents@latest).
- **inspect-web-network-capture:** the first call failed for two reasons. I passed JSON args where it expects positional arguments, and then it rejected a real Playwright 1.56 HAR on strict 'uri' format (an unescaped URL at entry 75). After percent-encoding every URL in a slimmed copy (bodies, cookies and auth headers removed; code/har_slim.py), it ran in about 3.5 s on the app-sign-in and demo-call HARs. It returned lossless normalised records (325 and 346) with limitations, but no stack or provider classification.
- **analyze-javascript-application:** ran on four @elevenlabs/client files in 6 s and produced a 5.7 MB application graph. It found the fetch (WebRTCConnection.js:180) and WebSocket (WebSocketConnection.js:110) call sites, but left the host literals defined in location.js unresolved.
- **analyze-web-bundle:** not run, because the vapi lane recorded it running more than 5 minutes at about 6 GB RSS with no output.

Every architecture fact in this lane came from our own reading: SDK source, DNS-over-HTTPS matched to GCP cloud.json and ARIN RDAP, the HAR, and string extraction from the signed-out bundle. REA confirmed none of it independently.
