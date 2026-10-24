# Synthflow teardown (account-free phase)

> The lane did not write this file (its last outputs were claims.json, predictions.json and the inbox proposal;
> its narrative went only to its structured output, which is not in the repo). The adversarial verifier created it so
> the Verification section has somewhere to live. The findings index is generated from `claims.json` **after**
> verification; the decisions and account-phase sections are the verifier's reading of the verified claims, not the
> lane's prose. Grades: observed | inferred | vendor-claimed | unknown, as in the teardown brief.

Claims: 59 (46 observed, 9 inferred, 2 vendor-claimed, 2 unknown). Predictions: 13, pre-registered in `predictions.json`. Raw artifacts: `data/teardown/synthflow/` (sha256 in `manifest.csv`). Other lane tables: `pricing.json`, `changelog.csv`, `ip-regions.csv`, `parity-delta.csv`. Verifier detail: `verify.md`.

## Findings by dimension (post-verification)

### Product surface

| id | grade | claim | evidence |
|---|---|---|---|
| SYN-01 | observed | Public docs index (llms.txt) lists 234 pages; the docs sitemap holds 135 more (106 dated changelog entries plus pages such as Aurora, legacy-cluster migration and outbound number pooling). The public OpenAPI 3.1 'PLATFORM API' has 69 paths and 110 operations under three base URLs: api.synthflow.ai/v2 (Global), api.us.synthflow.ai/v2 and api.eu.synthflow.ai/v2. | data/teardown/synthflow/docs/docs.synthflow.ai_llms.txt; data/teardown/synthflow/docs/docs.synthflow.ai_sitemap.xml; data/teardown/synthflow/openapi/docs.synthflow.ai_openapi.json; https://docs.synthflow.ai/openapi.json |
| SYN-02 | observed | Product surface: agent builder with Prompt Builder and node-based Flow Designer (multi-agent subflows, JSON import, templates); Aurora in-app copilot; actions (real-time booking, TEL/SIP/dynamic transfers with phone books, custom HTTP actions, in-call SMS/WhatsApp, post-call SMS and email, information extractors, custom evaluations, MCP connectors); knowledge base (PDF, URL, crawl, Zendesk import); Memory groups; Test Center simulations; version control; deployment to bought numbers, own Twilio, SIP, WhatsApp Business calling, WebSocket media, voice widget and chat (API, widget, WhatsApp, SMS); Campaigns; Workflows; logs with SIP ladder, PCAP download and live listen-in; analytics; CSV export; signed webhooks; agency subaccounts with custom domain, branding, limits and permissions; three roles, SSO, 2FA and allowed domains; billing. | data/teardown/synthflow/docs/docs.synthflow.ai_llms.txt; data/teardown/synthflow/docs-md/getting-started.md; data/teardown/synthflow/docs-md/sip-call-ladder.md; data/teardown/synthflow/docs-md/subaccounts.md |
| SYN-03 | observed | Enterprise gating is broad: SIP trunking and custom numbers, Campaigns, Aurora, the fallback voice, automatic daily exports, GPT models (and therefore BYOK, whether an OpenAI key or Azure OpenAI credentials) and SSO are Enterprise-only. Docs say the earlier Pro, Growth and Agency plans 'are no longer sold'. Inference, not observed: self-serve looks closed to new buyers (only Enterprise is priced and new sign-ups may be reviewed, SYN-04); whether a new sign-up can still buy any non-enterprise plan is unknown (SYN-P01). | data/teardown/synthflow/docs-md/telephony.md; data/teardown/synthflow/docs-md/batch-calling.md; data/teardown/synthflow/docs-md/aurora.md; data/teardown/synthflow/docs-md/voice-configuration.md; data/teardown/synthflow/docs-md/export-call-data.md; data/teardown/synthflow/docs-md/general-configuration.md; data/teardown/synthflow/docs-md/concurrency.md |
| SYN-04 | observed | Sign-up is gated: 'new accounts may be reviewed before full workspace access is enabled', showing a holding page. Email/password users must reset their password after approval. Sign-in still runs on the legacy Bubble app at fine-tuner.ai/auth (Google, SSO, email). | data/teardown/synthflow/docs-md/account-access-login.md; data/teardown/synthflow/capture/login.summary.json |
| SYN-05 | observed | Campaigns (outbound lists) shipped on 2026-08-18 as an Enterprise feature that support must switch on. They are created only through the API; the portal shows progress. Each request carries 1-10,000 recipients, up to 1,000,000 per campaign. A campaign is cancelled after seven days. Failed recipients are not retried. There is no per-campaign webhook. De-duplication happens only when the caller supplies an id. The calling window cannot cross midnight or be edited after creation. An agent's business hours that conflict with the window make recipients fail immediately instead of waiting. | data/teardown/synthflow/docs-md/batch-calling.md; data/teardown/synthflow/docs-md/changelog__2026__8__18.md; data/teardown/synthflow/openapi/docs.synthflow.ai_openapi.json (POST /calls/batch) |
| SYN-06 | observed | Contact data model: a contact is name*, phone_number*, email and contact_metadata.company. There are no consent, opt-out, DND or timezone fields, and no suppression-list endpoint anywhere in the 110 operations. 'Contacts' was renamed 'Memory' on 2026-05-12. | data/teardown/synthflow/openapi/docs.synthflow.ai_openapi.json (POST /contacts); data/teardown/synthflow/docs-md/changelog__2026__5__12.md |
| SYN-07 | observed | Opt-out is detected after the call, not enforced: the post-call LLM-judge payload carries opted_in and no_opt_out booleans ('false if the caller asked to be removed'), and the buyer has to act on them. | data/teardown/synthflow/docs-md/webhooks.md |
| SYN-08 | observed | The call object exposes 14 statuses, 10 end_call_reason values plus custom reasons, a telephony hang-up side and disconnect reason, ring and connect durations, RTCP-derived RTT, jitter, loss and MOS per WAN and LAN leg, a full action-execution timeline and collected variables. The data model is telephony-first in its observability. | data/teardown/synthflow/openapi/docs.synthflow.ai_openapi.json (GET /calls/{call_id}) |
| SYN-09 | observed | Silent API behaviour: on non-enterprise plans, requests that set llm to a GPT value 'are still accepted and the response looks normal, but the agent stays on Synthflow LLM. Nothing in the response signals that the value was ignored.' | data/teardown/synthflow/docs-md/changelog__2026__8__25.md; data/teardown/synthflow/docs-md/general-configuration.md |
| SYN-10 | observed | Billing mechanics: calls are metered per second and aggregated across calls into whole minutes. no-answer and hangup_on_voicemail calls are billed a flat 5 s; failed and user-canceled calls are not billed. Five AI chat messages count as one minute. Billing thresholds trigger invoices and are not spending caps. | data/teardown/synthflow/docs-md/usage.md |
| SYN-11 | observed | Capacity: each workspace has a concurrency limit and a call-attempts-per-second (CAPS) limit. Warm-transfer attempts start new outbound calls that count against CAPS, so transfer-heavy campaigns can starve. Subaccounts share the parent's limits. Over-limit calls get HTTP 429 or a short queue. | data/teardown/synthflow/docs-md/concurrency.md |
| SYN-12 | observed | Team model: three workspace roles (Super Admin, Admin, Member). Granular permissions exist only for agency subaccounts (actions, agent types, editor options, integrations), not for individual members. | data/teardown/synthflow/docs-md/user-management.md; data/teardown/synthflow/docs-md/manage-subaccount-permissions.md |
| SYN-13 | observed | Analytics in progress, behind flags that are off by default: a call-quality card (turn latency p50/p95 measured from the end of caller speech to the agent's first audio, transfers, predicted CSAT, containment), a 'voice-ux-evaluation' that scores unanswered questions, false action claims, off-topic replies and re-asked questions at one LLM call per call, and predicted CSAT. | data/teardown/synthflow/extracted/app/flipt.synthflow.ai_internal_v1_evaluation_snapshot_namespace_default; data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_index-boN6ncNO.js |
| SYN-14 | observed | Dashboard migration: the React app at app.synthflow.ai (Vite, React Router) became the default for every workspace on 2026-10-14. Authentication and Settings still run on the Bubble.io app at fine-tuner.ai. Public flag descriptions show the public /v2/subaccounts API was served by Bubble until it moved to a 'BFF', and that subaccount names were still stored in Bubble. | data/teardown/synthflow/docs-md/new-synthflow-app.md; data/teardown/synthflow/capture/app.summary.json; data/teardown/synthflow/capture/login.summary.json; data/teardown/synthflow/extracted/app/flipt.synthflow.ai_internal_v1_evaluation_snapshot_namespace_default |
| SYN-15 | observed | The MCP server and the official ChatGPT, Claude and Codex connectors are region-bound (mcp.synthflow.ai, mcp.us.synthflow.ai, mcp.eu.synthflow.ai) and expose the same tool set as Aurora. | data/teardown/synthflow/docs-md/openai.md; data/teardown/synthflow/docs-md/mcp-server.md; data/teardown/synthflow/docs-md/aurora.md |
| SYN-16 | observed | Aurora is Enterprise-only. It has thread memory and workspace-level 'Learnings', and the public flag says its router 'will choose between Claude Sonnet and Haiku'. | data/teardown/synthflow/docs-md/aurora.md; data/teardown/synthflow/extracted/app/flipt.synthflow.ai_internal_v1_evaluation_snapshot_namespace_default |

### Architecture

| id | grade | claim | evidence |
|---|---|---|---|
| SYN-20 | observed | Hosting is Google Cloud for telephony and the regional APIs. Of the 70 unique SIP signalling, media and egress IPs in the allow-list, 69 map to GCP: us-east1 (all Global and US addresses, 50), europe-west3 (EU, 17) and northamerica-south1 (LATAM media, 2), checked against Google's cloud.json of 2026-10-20. The 70th, US signalling IP 4.138.180.50, is Microsoft's (RDAP MSFT 4.128.0.0-4.143.255.255). The legacy Global cluster stores data in the EU but its signalling, media and egress addresses are all in us-east1. DNS: api.us and api.eu (and mcp.us, mcp.eu) sit on GCP global anycast addresses; app, api (Global) and fine-tuner.ai sit behind Cloudflare, origin not determined. | research/2026-10-20/teardown/synthflow/ip-regions.csv; data/teardown/synthflow/ipranges/gcp-cloud.json; data/teardown/synthflow/ipranges/rdap-4.138.180.50.json; data/teardown/synthflow/ipranges/dns-map.json; data/teardown/synthflow/docs-md/ip-allow-lists.md |
| SYN-21 | observed | There is no India region. Clusters are Global (EU storage, US or EU compute), US and EU; the cluster is chosen at workspace creation and cannot be changed, and the legacy Global cluster is being retired during Q4 2026. The docs' in-region call-quality targets are RTT under 100 ms and MOS above 4.2. | data/teardown/synthflow/docs-md/customer-region.md; data/teardown/synthflow/docs-md/legacy-cluster-migration.md; data/teardown/synthflow/docs-md/call-quality.md; data/teardown/synthflow/docs-md/deploy-in-latam-regions.md |
| SYN-21b | vendor-claimed | A point of presence near callers is offered on request. Synthflow's LATAM case study reports end-to-end RTT cut from 191.3 ms to 99.5 ms after moving a high-volume customer to a LATAM PoP, and says 'the same setup is available for other regions'. No India PoP is documented. | data/teardown/synthflow/docs-md/deploy-in-latam-regions.md; data/teardown/synthflow/docs-md/call-quality.md |
| SYN-22 | inferred | Telephony is probably self-run (inference from three observations). The docs' SIP ports are non-standard: 32681 (UDP/TCP) and 32682 (TLS), with RTP on 10000-60000. A Lead/Senior VoIP Engineer post asks for hands-on Kamailio and RTPEngine and working knowledge of FreeSWITCH (GCP, Kubernetes, Python or Go are listed only as nice to have). The public GitHub org has a FreeSWITCH fork ('Synthflow's FreeSWITCH source for image builds', updated 2026-09-29, with a patch that keeps a call alive when a REFER sipfrag fails) and a VoiceBlender fork (Go, updated 2026-08-16). Own SBCs are inferred from the Kamailio/RTPEngine pairing. | data/teardown/synthflow/docs-md/ip-allow-lists.md; data/teardown/synthflow/jobs/jobs.deel.com_synthflow-ai_job-details_edcb20bf-1024-453b-9826-bb25d6888862_overview.txt; https://github.com/SynthFlowAI |
| SYN-23 | observed | Browser WebRTC (dashboard Web Call and silent live listen-in) runs on a Janus WebRTC gateway through janode and the AudioBridge plugin. ICE is forced to TURN relay (iceTransportPolicy 'relay'). The BFF returns janusPublicUrl from GET /webrtc/ice-servers or POST /v3/webrtc/token, and calls carry a janus_pod_name. | data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_index-boN6ncNO.js; data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_condensed-ui-DecseHOV.js |
| SYN-24 | observed | Custom web and app integration uses WebSocket media rather than browser WebRTC: the client gets a base URL from the API (GET /v2/calls/outbound-test-ws-media/base-url), connects, then binds to a call on the same media node, and exchanges RTP packets (default) or raw codec payloads (opus, PCMA or PCMU). The docs' example base URL, wss://webrtc-us.synthflow.ai/ws-audio, does not resolve in public DNS (NXDOMAIN, 2026-10-20), so the live media host is issued per session. The older widget websocket endpoint was deprecated on 2026-06-15, as announced in the 2026-05-27 changelog entry. | data/teardown/synthflow/docs-md/ws-media-integration.md; data/teardown/synthflow/docs-md/changelog__2026__5__27.md |
| SYN-25 | inferred | LiveKit evidence in public material is historical only. A sample recording URL in the app bundle is signed by the GCP service account livekit-egress@synthflow-dev, with a 2024-08-01 timestamp in its path, so LiveKit Egress produced recordings in dev in 2024. No LiveKit client or signalling appears in the captured 2026 app bundles; browser WebRTC goes through Janus (SYN-23). This rules LiveKit out for the browser path only; whether it (or another framework) runs server-side is unknown. | data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_condensed-ui-DecseHOV.js; data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_index-boN6ncNO.js |
| SYN-26 | inferred | The call orchestrator is probably Python: the dashboard's end-reason map contains aiohttp-style errors naming internal 'orchestrator-dev' and 'orchestrator-testing' /outbound URLs and raw Python exceptions ('NoneType' object has no attribute ...). Whether it is in-house or built on a framework is unknown: Pipecat is Python and uses aiohttp, so these markers fit either, and no Pipecat or Vocode markers were found in public material. | data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_index-boN6ncNO.js |
| SYN-27 | observed | STT: the public API enum is deepgram, deepgram-nova-3 and synthflow-stt; the frontend enum adds soniox-stt-rt-v3. Endpointing modes are speculative, faster and high_accuracy, plus a transcriber_eager_end_of_turn parameter (flag: 'starts the answer as soon as the caller probably finished speaking… costs more'). | data/teardown/synthflow/openapi/docs.synthflow.ai_openapi.json; data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_condensed-ui-DecseHOV.js; data/teardown/synthflow/extracted/app/flipt.synthflow.ai_internal_v1_evaluation_snapshot_namespace_default |
| SYN-28 | inferred | 'Multilingual' agents very probably use a Deepgram multilingual STT model: Synthflow's list ('English, Spanish, French, German, Hindi, Russian, Portuguese, Japanese, Italian, and Dutch') matches Deepgram's ten-language multi list word for word and in order. Deepgram gives the same ten for Nova-3 multi and Flux general-multi, so the model is not determined, and Synthflow tells Multilingual agents on Synthflow TTS to use 'Synthflow STT'. On the STT side, Hindi is the only Indian language that can be mixed in. | data/teardown/synthflow/docs-md/about-supported-languages.md; https://developers.deepgram.com/docs/models-languages-overview (read 2026-10-20) |
| SYN-29 | observed | TTS: ElevenLabs is the default (Flash v2 for English, Flash v2.5 for multilingual; eight ElevenLabs models up to v4 and v4 Turbo). Deepgram Aura-2 appears in the frontend enum and as a fallback provider. 'Synthflow TTS', their own engine, launched on 2026-05-13 with 12 voices across 32 languages; the docs now list 200 voices, claim about 100-200 ms time to first audio, and say a Multilingual agent on Synthflow TTS keeps an English-biased delivery. The subprocessor list names GCP, OpenAI, Deepgram, ElevenLabs, Bubble.io and Twilio. | data/teardown/synthflow/docs-md/voice-configuration.md; data/teardown/synthflow/docs-md/elevenlabs.md; data/teardown/synthflow/docs-md/changelog__2026__5__13.md; data/teardown/synthflow/docs-md/ai-transparency.md; data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_condensed-ui-DecseHOV.js |
| SYN-30 | unknown | LLM: the only third-party models are OpenAI's (GPT-4o through GPT-6 Luna), plus 'Synthflow LLM' and 'Advanced Synthflow LLM' (synthflow-premium). Since 2026-08-25 every non-enterprise agent is forced onto Synthflow LLM. The base model behind Synthflow LLM is not disclosed anywhere public. A 'Prompt Reuse' metric (prompt caching) suggests a provider-side prompt cache. | data/teardown/synthflow/openapi/docs.synthflow.ai_openapi.json; data/teardown/synthflow/docs-md/general-configuration.md; data/teardown/synthflow/docs-md/changelog__2026__9__25.md |
| SYN-31 | observed | The homepage 'Talk to Synthflow' demo is a separate 'Conductor' web widget served from Fly.io. Its code streams PCM16 at 24 kHz in 20 ms frames over a WebSocket (no RTCPeerConnection) and admits callers through Cloudflare Turnstile plus a work email and a six-digit code; the runtime config caps calls at 240 s. Its client-side agent table names speech-to-speech models (gpt-realtime-2, gpt-realtime-mini, gemini-3.8-live). It was not exercised because entry needs an email code and Turnstile. | data/teardown/synthflow/extracted/widget/conductor-webwidget-synthflow-homepage.fly.dev_widget.js; data/teardown/synthflow/extracted/widget/conductor-webwidget-synthflow-homepage.fly.dev_runtime-config.js; data/teardown/synthflow/capture/home.summary.json |
| SYN-31b | inferred | The homepage demo probably runs on speech-to-speech models, not the product's STT-LLM-TTS cascade, so its quality says little about a deployed Synthflow agent. Inferred from the widget's client-side agent table (SYN-31) only: the server could map those ids differently, and no call was placed. | data/teardown/synthflow/extracted/widget/conductor-webwidget-synthflow-homepage.fly.dev_widget.js |
| SYN-32 | observed | Surrounding SaaS: Webflow site with HubSpot EU forms; app on Cloudflare; PostHog through an EU proxy (events.synthflow.ai), plus Amplitude; a self-hosted Sentry proxy; Flipt feature flags; Activepieces Cloud embedded as Workflows (workflow.synthflow.ai is a CNAME to cloud.activepieces.com); integration.app; WorkOS (admin links); Pylon support portal; Temporal workflows (flag text); Stripe billing; incident.io status page. | data/teardown/synthflow/capture/home.summary.json; data/teardown/synthflow/capture/app.summary.json; data/teardown/synthflow/ipranges/dns-map.json; data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_index-boN6ncNO.js; data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_condensed-ui-DecseHOV.js |
| SYN-33 | observed | flipt.synthflow.ai serves a 60-flag evaluation snapshot, descriptions included, to unauthenticated visitors. It exposes migration internals and roadmap (Bubble→React, the Memory Service, Postgres dual-writes, a Soniox custom voice for one customer, voice-UX evaluation). This is a pattern for VP to avoid. | data/teardown/synthflow/extracted/app/flipt.synthflow.ai_internal_v1_evaluation_snapshot_namespace_default |
| SYN-34 | observed | Source maps are referenced (sourceMappingURL) but not served: the .map URLs return the SPA's 3,351-byte HTML. No official SDK exists on npm or PyPI; there is only an n8n node under @synthflow-ai (author email at synthflow.ai), and PyPI 'synthflow' is an unrelated package. The GitHub org SynthFlowAI has 6 public repos. | data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_index-boN6ncNO.js; data/teardown/synthflow/sdk-n8n/x/package/package.json; https://github.com/SynthFlowAI; https://pypi.org/pypi/synthflow/json |
| SYN-37 | observed | The published subprocessor list (GCP, OpenAI, Deepgram, ElevenLabs, Bubble.io, Twilio) is incomplete against Synthflow's own code. The public flag aurora_model_router, on for all workspaces, routes Aurora 'between Claude Sonnet and Haiku' (Anthropic), and the frontend STT enum includes soniox-stt-rt-v3 with a flag for a 'custom soniox voice' for one customer. A buyer doing DPDP or vendor due diligence from the list would miss at least two processors. | data/teardown/synthflow/docs-md/ai-transparency.md; data/teardown/synthflow/verify/flipt-snapshot-noauth-recheck.json; data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_condensed-ui-DecseHOV.js |

### Pricing and unit economics

| id | grade | claim | evidence |
|---|---|---|---|
| SYN-40 | observed | Pricing remains Enterprise-only, 'Enterprise contracts start at $30,000 annually' (INR 28.5 lakh/yr at FX 95), with no per-minute list price. This confirms pricing-history.json (2026-09-10, 2026-10-17) and ledger CMP-18. | data/teardown/synthflow/site/pricing.html; https://synthflow.ai/pricing; research/2026-10-17/lanes/l4a-competitors/pricing-history.json; research/2026-10-17/ledger.md#CMP-18 |
| SYN-41 | inferred | Estimated all-in cost of an Indian outbound minute on Synthflow: INR 15.2-25.6 (inference from list prices, not a quote). Low end: the H1-2026 component rates ($0.09 voice engine + $0.02-0.05 LLM) plus BYO Twilio to an Indian mobile ($0.0496) from a non-Indian caller ID, $0.160-0.190 (INR 15.2-18.0). High end: Synthflow's own H1-2026 'PAYG typically $0.15-0.24/min', less its $0.02 managed US Twilio leg, plus Twilio India, $0.180-0.270 (INR 17.1-25.6). The 2026 enterprise rate is not public. If the $30k/yr floor is a usage commitment (assumed in pricing.py), the effective rate is INR 47.5/min at 5,000 min/month and INR 23.75 at 10,000, and the floor stops binding at roughly 9,000-16,000 min/month; if it is a fee on top, add INR 47.5, 23.75 and 9.5 per minute at 5k, 10k and 25k. That is about 2-7x Indian list prices of INR 3.5-7. | research/2026-10-20/teardown/synthflow/pricing.json; research/2026-10-20/teardown/synthflow/code/pricing.py; research/2026-10-20/teardown/vapi/pricing.json; research/2026-10-17/lanes/l4a-competitors/report.md |
| SYN-42 | inferred | COGS reconstruction, if Synthflow paid list prices for a third-party stack: Deepgram $0.0095-0.0099 + OpenAI-class LLM $0.0077-0.0452 + ElevenLabs $0.0146-0.0238 per minute (Vapi's published pass-through rates) + an unsourced placeholder of $0.002-0.006 for their own SBC/FreeSWITCH/Janus fleet = $0.034-0.085/min (INR 3.2-8.1), a 39-69% gross margin against the H1-2026 component rates ($0.11-0.14). Since 2026-08-25 non-enterprise agents run on Synthflow LLM, and Synthflow STT and TTS exist, which fits a push to lower COGS; the in-house unit cost and Synthflow's negotiated rates are not public. | research/2026-10-20/teardown/synthflow/pricing.json; data/teardown/synthflow/docs-md/changelog__2026__8__25.md; data/teardown/synthflow/docs-md/changelog__2026__5__13.md |
| SYN-43 | observed | Synthflow sells numbers only in the US, Canada and Australia, at $1.50 a month. | data/teardown/synthflow/docs-md/phone-numbers.md |
| SYN-44 | observed | In-product reselling (Stripe rebilling of subaccounts) ended on 2026-09-15. This supersedes the 2026-10-17 parity cell 'white-label + reseller toolkit $2,000/mo'. White-label survives as custom domain, branding and limits. | data/teardown/synthflow/docs-md/billing.md; data/teardown/synthflow/docs-md/changelog__2026__7__29.md |

### Velocity and reliability

| id | grade | claim | evidence |
|---|---|---|---|
| SYN-50 | observed | The docs carry 106 dated changelog entries from 2025-01-05 to 2026-10-20, 67 of them in the six months from 2026-04-20. The pace is 8-12 a month since 2026-03, against 1-4 a month in the 2025 months that have entries; 2025-02 to 2025-07 have none, so the early record may be incomplete and the comparison overstates the speed-up. | research/2026-10-20/teardown/synthflow/changelog.csv; research/2026-10-20/teardown/synthflow/code/changelog.py |
| SYN-51 | observed | Themes of the last six months: contact-centre integrations (Zoom, RingCX, 8x8, Five9 handoff), the Bubble-to-React app rebuild, in-house TTS and LLM, Campaigns and business hours (2026-08-18), transfer outcome states and failure reasons, call-quality metrics on every call, simulations in the editor, the EU region (2026-05-01), and MCP, Claude, ChatGPT and Codex connectors. Product weight sits on enterprise inbound CX. | research/2026-10-20/teardown/synthflow/changelog.csv |
| SYN-52 | observed | The status page moved to incident.io on 2026-07-16 and earlier history was not carried over. It shows three incidents since August: on 2026-08-07 post-call AI outputs were empty for 2 h 50 m after a model-restriction config change (the webhooks still fired); on 2026-08-17 calls failed for 9-12 min in the EU and US and warm transfers failed intermittently for 3 h 42 m; on 2026-09-07 white-label logins failed. It also lists 8 maintenance windows. | data/teardown/synthflow/status/status.synthflow.ai_feed.rss.out; data/teardown/synthflow/extracted/app/status.synthflow.ai_api_v1_summary; data/teardown/synthflow/docs-md/changelog__2026__7__16.md |
| SYN-53 | unknown | Whether the 2026-08-07 incident ('restricted which AI models the platform was permitted to call') was part of the model-restriction rollout announced on 2026-08-25 is unknown. Topic and timing match; the cited flag llm_selection_restriction (ENG-6621) is described as a frontend change, while the incident was a backend permission that blocked post-call processing. | data/teardown/synthflow/status/status.synthflow.ai_feed.rss.out; data/teardown/synthflow/extracted/app/flipt.synthflow.ai_internal_v1_evaluation_snapshot_namespace_default |
| SYN-54 | vendor-claimed | Funding: a $20M Series A (Accel, June 2025), about $30M in total, Berlin HQ, founded 2023. Claimed scale: '65M+ voice calls every month in 30+ countries', '1,000+ customers', '99.99% uptime'. | data/teardown/synthflow/site/pricing.html; data/teardown/synthflow/jobs/jobs.deel.com_synthflow-ai_job-details_edcb20bf-1024-453b-9826-bb25d6888862_overview.txt; https://synthflow.ai/news/synthflow-raises-20m-series-a |

### India operating plumbing

| id | grade | claim | evidence |
|---|---|---|---|
| SYN-60 | observed | None of the 370 saved docs pages mentions India, TRAI, DLT, NCPR/NDNC/DND, the 140/160 series, DPDP or do-not-call scrubbing (word-bounded grep; the only '160'/'1600' hits are a HIPAA citation, an IP address and a street address). The only Indian-adjacent items are the Hindi language and the Asia/Kolkata timezone. | data/teardown/synthflow/docs-md/; data/teardown/synthflow/docs-md/time-zones.md |
| SYN-61 | inferred | An Indian enterprise cannot present a compliant Indian CLI on Synthflow out of the box. Synthflow sells only US, Canadian and Australian numbers; Twilio dials India only from non-Indian numbers; SIP trunks are Enterprise-only; Indian carrier trunks require media anchored in India (Plivo, l2; Exotel staff, EXO-27), where Synthflow has no PoP; and its custom-number providers (twilio, telnyx, vonage, ring_central, ringcx, custom, zoom, five9, 8x8) include no Indian carrier. Two non-native routes remain: a Synthflow PoP in India (offered on request, vendor-claimed, SYN-21b), or a buyer-built bridge from an Indian CPaaS media stream such as Exotel AgentStream (EXO-13) into Synthflow's WebSocket media API (SYN-24). Whether either is lawful for a 140/1600-series deployment is not established. | data/teardown/synthflow/docs-md/phone-numbers.md; data/teardown/synthflow/docs-md/telephony.md; data/teardown/synthflow/docs-md/customer-region.md; research/2026-10-20/teardown/vapi/pricing.json; research/2026-10-17/lanes/l2-economics/report.md |
| SYN-62 | observed | Consent is left to the buyer. The product has a recording-consent prompt toggle and an example AI disclosure ('This is an AI-powered call from Synthflow…'), and states that outbound AI calls are placed only where 'the customer has confirmed user consent is collected'. There is no consent ledger, no DNC list and no suppression list. | data/teardown/synthflow/docs-md/ai-transparency.md; data/teardown/synthflow/openapi/docs.synthflow.ai_openapi.json (agent.is_consent_enabled, consent_message) |
| SYN-63 | observed | Calling windows can be set per campaign (call_time_window) and per agent (business hours), in the agent's timezone. There are no jurisdiction presets, holiday calendars or per-recipient timezones; the buyer must encode the Indian window by hand. | data/teardown/synthflow/docs-md/batch-calling.md; data/teardown/synthflow/docs-md/business-hours.md |
| SYN-64 | observed | Residency and DPDP: data is stored in the EU (Global cluster) or the US or EU, and the cluster cannot be changed later. Options are a 30-day retention toggle and PII redaction of US-centric types (SSN, cards, names, emails, phones, addresses), with no Aadhaar or PAN. With no India residency, cross-border transfer obligations fall on the buyer. | data/teardown/synthflow/docs-md/customer-region.md; data/teardown/synthflow/docs-md/security-and-compliance.md |
| SYN-65 | observed | Hindi is the only Indic language. There is no Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam or Punjabi, and no en-IN option (the docs offer American, British and Australian English accents; the API language enum's only English code is en-US). A Multilingual agent on Synthflow TTS keeps an English-biased delivery. | data/teardown/synthflow/docs-md/about-supported-languages.md; data/teardown/synthflow/docs-md/voice-configuration.md; data/teardown/synthflow/openapi/docs.synthflow.ai_openapi.json (agent.language enum) |
| SYN-66 | inferred | Opt-out handling on Synthflow can fail silently. The only opt-out signal is a post-call LLM-judge field (no_opt_out, SYN-07), and on 2026-08-07 from 08:20 to 11:10 UTC that judge, the extractors and post-call SMS did not run while the post-call webhook was still delivered with those fields empty. A buyer suppressing numbers from no_opt_out would have missed every opt-out request in that window without any error. For an Indian deployment that must honour opt-outs, this is a place a platform that enforces suppression at dial time is measurably better. | data/teardown/synthflow/status/status.synthflow.ai_feed.rss.out; data/teardown/synthflow/docs-md/webhooks.md |

### Failure modes

| id | grade | claim | evidence |
|---|---|---|---|
| SYN-70 | observed | Trustpilot (TrustScore 4.1, 215 reviews, unchanged since 2026-10-17) has 21 one- and two-star product reviews from 2024-05 to 2026-05. Coded: SUPPORT 19, BILLING 11, RELIABILITY 9, PLAN_GATING 4, TELEPHONY 3, and 1 each for CAMPAIGNS, FAILURE_VISIBILITY, UNANNOUNCED_CHANGE, WHITE_LABEL, ACCOUNT_UI, INTEGRATION and SALES_DELIVERY. The text comes from a WebFetch extraction (direct fetches hit bot protection). This extends the 11 hand-coded rows in complaints.csv, all of which reappear, and keeps the same order (support > billing > reliability). | data/teardown/synthflow/complaints/trustpilot-webfetch-2026-10-20.json; https://www.trustpilot.com/review/synthflow.ai?stars=1&stars=2; research/2026-10-17/lanes/l4a-competitors/complaints.csv |
| SYN-71 | observed | The failure-reason taxonomy is not normalised. The dashboard's end-reason label map keys on raw strings: Python exceptions ("'NoneType' object has no attribute 'replace'" and '... 'items''), aiohttp-style errors with internal dev and testing orchestrator URLs, and SIP strings ('403 : Forbidden', '484 : Address Incomplete'). The exceptions and URL errors fold into 'System Error'; the SIP strings get their own labels. | data/teardown/synthflow/extracted/app/app.synthflow.ai_assets_index-boN6ncNO.js |
| SYN-72 | observed | The public feedback board shows the same pains: a request for Slack support because email went unanswered ('5 days ago'), 'Don't make breaking changes to the Assistants API endpoints' (pagination changed 'with no heads up'), no fallback when Synthflow returns an error on the V2 SIP path, and missing Urdu and Arabic. | data/teardown/synthflow/feedback/feedback.synthflow.ai_.txt; https://feedback.synthflow.ai/ |
| SYN-73 | observed | Sources that were blocked and not bypassed: G2 and Capterra (403 to WebFetch), Reddit (unreachable), security.synthflow.ai (Cloudflare challenge) and Trustpilot to curl (403; WebFetch worked). Synthflow claims '4.5 / 1,000+ reviews on G2', which is unverified. | data/teardown/synthflow/complaints/trustpilot-webfetch-2026-10-20.json; data/teardown/synthflow/feedback/security.synthflow.ai_.txt; data/teardown/synthflow/site/pricing.html |

### v2 notes: memory, personalisation, learning

| id | grade | claim | evidence |
|---|---|---|---|
| SYN-80 | observed | Memory groups: per-contact summaries (questions, solutions, preferences) are injected at the start of each call. Contacts are matched by phone number and memory is shared across voice, SMS and WhatsApp. The backend is moving from Postgres to a dedicated Memory Service (flag modes off, dual-write and canonical). | data/teardown/synthflow/docs-md/memory.md; data/teardown/synthflow/docs-md/changelog__2026__6__22.md; data/teardown/synthflow/extracted/app/flipt.synthflow.ai_internal_v1_evaluation_snapshot_namespace_default |
| SYN-81 | observed | Marketing overstates learning relative to the docs. The site says insights 'feed back into the next version — so agents improve continuously' and announces 'Data Fine-Tuning' in the future tense. The docs' Learn step is analytics, logs and export plus Aurora prompt-review skills; no automated optimisation loop, fine-tuning or A/B testing is documented. The marketing line fits a manual loop, so this is overstatement rather than contradiction. | data/teardown/synthflow/site/home.html; data/teardown/synthflow/site/conversational-ai-platform.html; data/teardown/synthflow/docs-md/getting-started.md; data/teardown/synthflow/docs-md/aurora.md |
| SYN-82 | observed | Personalisation inputs: custom variables, dynamic prompt injection, the inbound-call webhook, SIP X-headers and the Diversion header, and memory. Evaluation: Test Center simulations with AI-generated cases, custom evaluations, and post-call LLM-judge fields (persona, steps, objections, goal and others). | data/teardown/synthflow/docs-md/custom-variables.md; data/teardown/synthflow/docs-md/dynamic-prompt-injection.md; data/teardown/synthflow/docs-md/pass-call-context.md; data/teardown/synthflow/docs-md/simulations.md; data/teardown/synthflow/docs-md/webhooks.md |

### Method

| id | grade | claim | evidence |
|---|---|---|---|
| SYN-90 | observed | REA 6.7.0: inspect-web-network-capture ran in 3.7 s on the 10 MB app HAR and returned a lossless 10 MB evidence envelope with no analytic summary (it refuses --token-limit for structured output). analyze-web-bundle over CDP against app.synthflow.ai produced no output in 300 s, the same failure the vapi lane saw. Findings came from Playwright HARs plus our own bundle and flag parsing. | data/teardown/synthflow/rea/app-har-inspect.json; data/teardown/synthflow/rea/app-analyze-web-bundle.status.json |

## What this means for the three decisions

These are the verifier's readings of the verified claims; each names the claims it rests on.

1. **Pre-sale or post-sale first.** Synthflow does not decide this for us. Its product weight is enterprise inbound
   customer service (SYN-51, not re-checked), and its outbound tooling (Campaigns, Enterprise-only and API-only since
   2026-08-18, SYN-05) carries no consent, DND or suppression controls (SYN-06, SYN-62). An Indian promotional
   (pre-sale) programme on Synthflow would put all 140-series, consent and NCPR work on the buyer, and Synthflow cannot
   present an Indian CLI out of the box at all (SYN-61). A post-sale service job such as renewal reminders is lighter on
   regulation, but it still hits the same CLI and opt-out gaps. Synthflow therefore competes for Indian enterprises
   only where the buyer already has India-side telephony; it is not a reference for either job in India.
2. **v1 parity floor.** Synthflow shows what an enterprise buyer will expect beyond the 2026-10-17 headline features:
   per-call telephony observability (SIP ladder, PCAP, RTT, jitter and MOS per leg, SYN-08), signed webhooks, an
   action-execution timeline, agency sub-accounts, test simulations and version control (SYN-02, SYN-82), cross-channel
   memory (SYN-80), and a builder copilot (SYN-16). Of these, telephony observability and failure reasons a person can
   act on are the ones the complaint data ties to pain (SYN-70, SYN-71).
3. **Where VP can be measurably better than Synthflow.** Each has a task we can run:
   - *India telephony:* an Indian CLI (including 140/1600 series) without a custom PoP or a buyer-built bridge
     (SYN-61, SYN-43, SYN-21). Task: first live call to an Indian handset from an Indian CLI, minutes from sign-up.
   - *Opt-out and suppression enforced at dial time,* not inferred after the call by an LLM judge that has failed
     silently (SYN-07, SYN-66). Task: the messy-CSV opt-out row is never dialled.
   - *Campaign robustness:* retries per outcome, windows that can be edited and cross midnight, no seven-day cut-off,
     and no silent failure when agent hours and the window disagree (SYN-05, SYN-63). Task: schedule within Indian
     calling hours and count recipients failed versus waiting.
   - *Normalised failure reasons* (SYN-71). Task: find a failed call and its actionable reason in under a minute.
   - *Self-serve onboarding:* Synthflow is sales-led from $30k/yr (SYN-40, SYN-03, SYN-04). Task: sign-up to first call.
   - *Hinglish and Indic depth:* Hindi is the only Indic language and Multilingual is a ten-language STT set with an
     English-biased TTS delivery (SYN-28, SYN-65). Task: the l4b code-switch battery on both platforms.
   - *v2, recorded only:* Synthflow's memory is per-contact summaries keyed on phone number (SYN-80); its learning loop
     is manual despite the marketing (SYN-81).

Price is not one of these places: Synthflow's Indian minute is an estimate of INR 15.2-25.6 plus a $30k floor (SYN-41),
far above Indian list prices, but the parity-and-undercut wedge was already rejected (`rejected.2026-10-17.parity-undercut`).

## Account phase needs

What only a workspace on team@vyakti.ai (or a sales-led sandbox) can show, in priority order:

- Whether a new sign-up gets a usable workspace at all, and how long it takes (SYN-P01; SYN-03, SYN-04).
- Whether a purchased US number or BYO Twilio can reach our Indian handset, and the errors on the way (SYN-P02).
- The handset-side reply gap over Indian PSTN and the Hinglish language hold (SYN-P09, SYN-P10), with the STT and TTS
  actually in use recorded (SYN-28: Multilingual may run on 'Synthflow STT').
- What 'Synthflow LLM', 'Synthflow STT' and 'Synthflow TTS' are, by STT error pattern and TTS voice fingerprint
  (SYN-30 is unknown).
- The messy-CSV, calling-window, voicemail/transfer, failed-call and export tasks, scored per the verifier's notes in
  `predictions.json` (SYN-P04 to P08).
- Every settings and campaign screen for any India compliance control (SYN-P12), and whether the call-quality card or a
  turn-latency field is visible (SYN-13: the flag is off for every workspace in the public snapshot).
- If the owner authorises a sales conversation: the quote's floor, per-minute rate and India deployment terms (SYN-P13),
  including whether the $30k is a usage commitment or a fee on top (SYN-41).

## Verification

Adversarial verifier pass, 2026-10-20. Method, re-run captures and residual risks are in `verify.md`. Every claim in
scope (architecture, pricing, India plumbing, v2), and the surface, velocity and failure-mode claims that inbox nodes
rely on, was re-derived from the cited file or URL. Result over the lane's 55 claims: **30 confirmed, 18 corrected,
2 downgraded, 0 refuted outright, 5 not re-checked**; 2 claims split out and 2 added. Replaced text is kept in each
claim as `claim_before_verification`, and every re-checked claim carries a `verification` object.

### Downgraded

- **SYN-22** (observed -> inferred). "Telephony is self-run / own SBCs" is an inference from the ports, the job post and
  the GitHub forks, not an observation. The job post lists GCP, Kubernetes, Python or Go only as nice to have, so "on GCP
  and Kubernetes" was overstated.
- **SYN-53** (inferred -> unknown). The 2026-08-07 incident and the 2026-08-25 model restriction share a topic and are
  18 days apart; nothing else links them. The cited flag (ENG-6621) is described as a frontend change, while the
  incident was a backend permission on which models the platform could call.

### Corrected (grade kept, text fixed)

- **SYN-03** (observed). "Self-serve is effectively closed to new buyers" is now marked as inference; the 2026-08-25
  changelog still refers to non-enterprise accounts. BYOK covers Azure OpenAI too (azure.md), against
  general-configuration.md's "only an OpenAI key".
- **SYN-20** (observed). 69 of 70 IPs are GCP ("every" contradicted its own exception). Added: the EU-storage Global
  cluster has all of its signalling, media and egress addresses in us-east1.
- **SYN-21** (observed). The LATAM RTT figures (191.3 -> 99.5 ms) are a vendor case study and moved to SYN-21b
  (vendor-claimed).
- **SYN-24** (observed). The old websocket endpoint was deprecated on 2026-06-15, announced on 2026-05-27, not
  deprecated on 2026-05-27. The example host wss://webrtc-us.synthflow.ai is NXDOMAIN on two resolvers; the live
  base URL comes from an API call. "Raw audio" means raw codec payloads (opus, PCMA, PCMU).
- **SYN-25** (inferred). The absence of LiveKit in the bundles rules it out for the browser path only; "not current
  production orchestration" is not supported, because a server-side framework is invisible to the client.
- **SYN-26** (inferred). "Probably Python" holds. "In-house" does not: Pipecat is Python and uses aiohttp, so the
  markers fit either.
- **SYN-28** (inferred). The word-for-word match with Deepgram's ten-language multi list holds, but Deepgram lists the
  same ten for Flux general-multi, so "Nova-3" is not determined. The docs also tell Multilingual agents on Synthflow TTS
  to use Synthflow STT.
- **SYN-29** (observed). Synthflow TTS launched on 2026-05-13 with 12 voices across 32 languages; 200 is today's figure.
  "Biased toward English" is stated for Synthflow TTS on Multilingual agents.
- **SYN-31** (observed). The client-code facts hold (24 kHz PCM16 over WebSocket, Turnstile, a work email and a
  six-digit code, 240 s). "So the demo is not the product cascade" moved to SYN-31b (inferred), since no call was placed.
- **SYN-41** (inferred). The upper bound ignored Synthflow's own H1-2026 "PAYG typically $0.15-0.24/min". The range is
  now INR 15.2-25.6, not 15.2-18.0. The text said the $30k floor is "added on top", but pricing.py treats it as a usage
  commitment; both readings are now shown. "3-5x Indian list (INR 3-6)" becomes about 2-7x against INR 3.5-7.
- **SYN-42** (inferred). The own-infrastructure line ($0.002-0.006) has no source and is now labelled a placeholder.
  The component prices are Vapi's pass-through rates, and non-enterprise agents no longer run on OpenAI.
- **SYN-50** (observed). The monthly pace is 8-12 since 2026-03 (August had 8), and 1-4 in 2025. February to July 2025
  have no entries, so the early record may be incomplete.
- **SYN-60** (observed). The corpus is 370 pages, not 371; the word-bounded grep is now spelled out. The "160"/"1600"
  hits are a HIPAA citation, an IP address and a street address.
- **SYN-61** (inferred). "Would need a custom PoP" is too strong. A buyer-built bridge from an Indian CPaaS media stream
  (Exotel AgentStream, EXO-13/EXO-28) into Synthflow's WebSocket media API is a second route. No Indian carrier is among
  Synthflow's telephony providers. Whether either route is lawful for 140/1600 calling is not established.
- **SYN-65** (observed). The API language enum's only English code is en-US; "biased toward English" is scoped to
  Synthflow TTS.
- **SYN-70** (observed). The singleton list omitted INTEGRATION and SALES_DELIVERY. The saved Trustpilot HTML files are
  AWS WAF interstitials, so the text is WebFetch extractor output; all 11 rows hand-coded on 2026-10-17 reappear in it.
- **SYN-71** (observed). "403 : Forbidden" and "484 : Address Incomplete" get their own labels; only the Python
  exceptions and the orchestrator-URL errors fold into "System Error".
- **SYN-81** (observed). "Disagree" is now "overstate": "feed back into the next version" fits the manual loop the
  docs describe.

### Confirmed (grade kept; notes added where the re-check found more)

SYN-01, 04, 05, 06, 07, 08, 09, 10, 11, 13, 14, 15, 16, 23, 27, 30, 32, 33, 34, 40, 43, 44, 52, 54, 62, 63, 64, 80, 82, 90.
Notable extensions:
- SYN-13: the three analytics flags have no rollouts, so they are off for every workspace.
- SYN-16: the Aurora Sonnet/Haiku router flag is on for all workspaces.
- SYN-33: the snapshot re-fetched with no credentials returned HTTP 200; it also exposes rollout segments and a
  customer's name.
- SYN-64: PII redaction does not touch recordings or live audio.
- SYN-07: the opt-out judge is the one that failed silently on 2026-08-07.

### Not re-checked

SYN-02, SYN-12, SYN-51, SYN-72, SYN-73: outside the verifier's scope and not load-bearing for any inbox node.

### Split out or added by the verifier

- **SYN-21b** (vendor-claimed): the LATAM PoP case study; no India PoP is documented.
- **SYN-31b** (inferred): the homepage demo probably runs on speech-to-speech models.
- **SYN-37** (observed): the subprocessor list omits Anthropic (the Aurora router) and Soniox (the STT enum and a
  customer voice flag).
- **SYN-66** (inferred): opt-out detection depends on a post-call LLM judge that did not run for 2 h 50 m on
  2026-08-07, while the webhook still fired with empty fields. Opt-outs in that window would have been lost without
  any error.

### Predictions

13 checked; `falsifiable` and `verifier_note` added in `predictions.json`; prediction text is unchanged.
- **SYN-P04** is not falsifiable as written ("fails or turns awkward"); score it as four sub-items.
- **SYN-P05**'s "setting both gates fails at least one recipient" contradicts the docs for overlapping windows; score
  only the non-overlapping configuration.
- **SYN-P09**'s call-quality-card clause is probably unscorable, because the flag is off everywhere.
- **SYN-P02** is compound; score it as two items.
- **SYN-P13** is conditional on a sales conversation.
- The rest are falsifiable as written.

### Other lane files

- `pricing.json`: a `verifier_2026_10_20` block appended; the lane's figures are kept.
- `parity-delta.csv`: 4 rows corrected (code_switching, auto_optimisation_learning, analytics, public_demo).
- `manifest.csv`: 13 verifier rows added (499 total, 0 sha256 mismatches).

### Inbox

`context/inbox/teardown-synthflow.json`: no node was refuted, so none was removed.
- 11 of the 12 nodes corrected to match the verified claims; the REA rejection node is unchanged.
- `measure.2026-10-20.synthflow-india-allin-price` set to source `model` and status `proposed`, and its numbers fixed.
  It is a computation, not a measurement we took.
- Added: node `evidence.2026-10-20.synthflow-verify`, 2 edges and 1 event.
- Validated with `scripts/lib/context-schema.mjs` (0 errors); every edge end exists.


## Verification (adversarial verifier, workflow wf_560edf6c-5d6)

- Checked: 50; confirmed: 30; downgraded: 4; refuted: 5
- Hit rate: 30/50 re-checked claims confirmed as written (60%). 46/50 kept their grade with text fixes or none (92%), and 2 were downgraded; the other 2 kept their grade but had a part split out to a lower grade. 0 refuted outright. 7 had a partial factual error (SYN-24, 29, 41, 50, 60, 70, 71) and 4 overreached in their conclusion (SYN-25, 26, 28, 61). 5 out-of-scope claims were not re-checked. Of the 13 predictions, 11 are falsifiable as written or once split; P04 is not falsifiable as written and P05 is partly contradicted by the docs.

### Refuted

- SYN-41: Part refuted; corrected in place, grade kept inferred. The upper bound ignored Synthflow's own H1-2026 'PAYG typically $0.15-0.24/min', so the Indian all-in minute is INR 15.2-25.6, not 15.2-18.0. The text said the $30k floor is 'added on top', but pricing.py treats it as a usage commitment. '3-5x Indian list (INR 3-6)' is about 2-7x against INR 3.5-7.
- SYN-24: Part refuted; corrected in place. The 2026-05-27 changelog entry says the old websocket endpoint was deprecated on 2026-06-15, not on 2026-05-27. The cited wss://webrtc-us.synthflow.ai host is only a docs example value and is NXDOMAIN on Cloudflare and Google DNS; the live base URL comes from an API call.
- SYN-29: Part refuted; corrected in place. Synthflow TTS launched on 2026-05-13 with 12 voices across 32 languages (changelog); '200 voices' is today's docs figure.
- SYN-71: Part refuted; corrected in place. '403 : Forbidden' and '484 : Address Incomplete' map to their own labels, not to 'System Error'; only the Python exceptions and orchestrator-URL errors fold into it.
- SYN-61: Overreach refuted; corrected, grade kept inferred. 'Would need a custom PoP' is too strong: a buyer-built bridge from an Indian CPaaS media stream (Exotel AgentStream, EXO-13/EXO-28) into Synthflow's WebSocket media API is a second route. Whether either route is lawful for 140/1600 calling is not established.

### Downgraded

- SYN-22 (observed -> inferred): The ports, the VoIP job post and the GitHub forks are observed, but 'telephony is self-run / own SBCs' is an inference from them. The job post lists GCP, Kubernetes, Python or Go only as nice to have, so 'on GCP and Kubernetes' was overstated.
- SYN-53 (inferred -> unknown): The only link between the 2026-08-07 incident and the 2026-08-25 model restriction is topic and an 18-day gap. The cited flag ENG-6621 is described as a frontend change, while the incident was a backend restriction on which models the platform could call.
- SYN-21 (split to SYN-21b) (observed -> vendor-claimed): The LATAM PoP RTT figures (191.3 -> 99.5 ms) are a vendor case study we did not measure. The cluster facts stay observed in SYN-21.
- SYN-31 (split to SYN-31b) (observed -> inferred): 'The marketing demo is not the product cascade' rests only on the client-side agent table; no call was placed. The widget code facts (24 kHz PCM16 over WebSocket, Turnstile, six-digit code, 240 s cap) stay observed in SYN-31.

### Notes

The lane never wrote report.md. The verifier created /home/user/sales-enabler/research/2026-10-20/teardown/synthflow/report.md: a findings index generated from the verified claims, a reading of the three decisions, the account-phase needs, and an appended Verification section. Full detail is in /home/user/sales-enabler/research/2026-10-20/teardown/synthflow/verify.md.

What was re-run (raw files in /home/user/sales-enabler/data/teardown/synthflow/verify/, all added to manifest.csv: 499 rows, 0 sha256 mismatches):
- IP-to-region mapping against a fresh allow-list and cloud.json: 70 IPs, 69 GCP, 1 MSFT.
- DoH for 22 hosts.
- An unauthenticated Flipt snapshot fetch: HTTP 200, 60 flags.
- The live pricing page, a source-map URL, and npm and PyPI searches.
- GitHub org and Deepgram language pages via WebFetch (the GitHub API was refused by the session proxy).
- Recounts of the OpenAPI enums, the docs bounded negatives (370 pages), the changelog, the status RSS and the Trustpilot extract.
Not re-run: REA, any logged-in view, any call.

Lane conclusions that change:
1. The Indian minute is INR 15.2-25.6. The inbox price node moves to source 'model' and status 'proposed'.
2. A second India route exists: a buyer-built bridge from an Indian CPaaS stream, besides a Synthflow PoP.
3. Architecture claims were narrowed:
   - own SBCs: inferred;
   - orchestrator: Python, but in-house or framework is unknown;
   - Multilingual STT: Deepgram's ten-language multi set, Nova-3 or Flux;
   - LiveKit: absent from the browser path only;
   - the documented WebSocket media host does not resolve.

Added claims:
- SYN-37 (observed): the subprocessor list omits Anthropic (the Aurora router flag is on for all workspaces) and Soniox.
- SYN-66 (inferred): opt-out detection depends on a post-call LLM judge that did not run for 2 h 50 m on 2026-08-07 while the webhook fired with empty fields. This is the sharpest measurable place for VP to be better: suppression enforced at dial time.

Files edited in place:
- claims.json: 59 claims; every one carries a verification object; replaced text kept as claim_before_verification.
- predictions.json: falsifiable and verifier_note on all 13.
- pricing.json: a verifier block appended.
- parity-delta.csv: 4 rows corrected.
- /home/user/sales-enabler/context/inbox/teardown-synthflow.json: 11 nodes corrected, 1 node added (evidence.2026-10-20.synthflow-verify), 2 edges and 1 event added. No node was refuted, so none was removed. 0 schema errors and every edge end exists.

graph.json was not edited, and nothing was committed.

For the account-phase prompt to Instinct: Synthflow sign-up may be review-gated and sales-led. Whether team@vyakti.ai gets a workspace at all is the first measurement (SYN-P01). The demo widget needs an email code and Turnstile, which only a human or the account phase may pass.
