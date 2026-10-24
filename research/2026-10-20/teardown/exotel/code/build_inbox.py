"""Graph proposals for the Exotel lane -> context/inbox/teardown-exotel.json (main loop merges; agents never edit graph.json).
Usage (repo root): python3 -I research/2026-10-20/teardown/exotel/code/build_inbox.py context/inbox/teardown-exotel.json"""
import json, sys

R = "research/2026-10-20/teardown/exotel/"
D = "2026-10-20"
N, E = [], []


def node(**k):
    k.setdefault("date", D)
    k.setdefault("status", "proposed")
    N.append(k)


def edge(a, b, rel):
    E.append({"from": a, "to": b, "relation": rel})


node(id="evidence.2026-10-20.exotel-claims", type="evidence", source="verified",
     title="Exotel public teardown (account-free): 64 graded claims (48 observed, 11 vendor-claimed, 5 inferred) from both docs portals (341 + 915 llms.txt pages saved as Markdown), the public VoiceBot console login bundle (95 endpoint constants) and SDK source map, the open ExotelMCP / Agent-Stream / ClearStream repos, DNS-to-AWS-region mapping, Statuspage JSON, pricing pages, 18 engineering posts, npm release history and complaint threads; sha256 manifest of 2,036 raw files. No account, form or demo request. report.md was not written (subagent harness rule); its text is in the lane structured output.",
     path=R + "claims.json")
node(id="evidence.2026-10-20.exotel-rails-for-everyone", type="evidence", source="verified",
     title="Exotel is the rails, including for its own bot: VoiceBot is reached through the same AgentStream WebSocket path as any BYO bot (dp-endpoint wss URL -> Calls/connect, observed in ExotelMCP source); the protocol and REST API are Twilio-shaped (MZ/CA/AC ids, connected/start/media/mark/clear/stop; the SG API ALB is named 'twilix'); Pipecat ships an Exotel serializer; docs.exotel.com carries AgentStream/SIP guides for ElevenLabs, LiveKit, Bolna, Retell, Smallest, Sarvam, Pipecat, Cartesia, OpenAI Realtime and others. Exotel claims ~40% of India's voice-AI conversations run on it (vendor claim).",
     path=R + "claims.json")
node(id="evidence.2026-10-20.exotel-voicebot-architecture", type="evidence", source="verified",
     title="Exotel VoiceBot architecture (graded): observed - India control plane on AWS ap-south-1 (voicebot-production-alb, api.in, my.in, mcp), SG on ap-southeast-1, Auth0 login, console is a module of the Ameyo-lineage ECC web app (React/MUI X, Keycloak, XMPP; exotelSDK = vendored SIP.js 0.20.0), embedded Superset analytics, versioned assistants with traffic allocation; vendor-claimed - Asterisk-based media plane moving 20 ms 8 kHz frames, ClearStream denoiser (target end-Oct 2026), certified hi/en stack Deepgram or ElevenLabs STT + Gemma + Smallest or ElevenLabs TTS, Indic alpha on Azure/Sarvam/Gemini/Google; inferred - own orchestration (no LiveKit/Pipecat/Daily in the bundle).",
     path=R + "claims.json")
node(id="measure.2026-10-20.exotel-cogs-and-price", type="measurement", status="measured", source="verified",
     title="Exotel VoiceBot reconstructed COGS INR 1.42 / 1.95 / 3.60 per connected minute (lo/mid/hi, ex-GST) on its documented hi/en stack; list price for VoiceBot and AgentStream unpublished (sales-quoted); PSTN 'typically' INR 0.80-1.00/min outbound in 60-s pulses (+25% billed-minute inflation vs ~12% for 30-s pulses). VP on Exotel AgentStream would pay +0.34 to +0.54 INR/min more telephony than the Plivo model before any stream fee. Business plans are published (Dabbler 9,999 / 5 months, unchanged since 2017), correcting l4a/l4c 'quote-based since 2025'.",
     n="5 cost components x 3 scenarios; 5 price points read; pulse rounding simulated on 100,000 call lengths",
     method="computed from 2026-10-18 g4 component list prices (FX 95) and Exotel pricing pages / blog read 2026-10-20 (code/pricing.py); list prices and a vendor-documented stack, not invoices or captured traffic",
     path=R + "pricing.json")
node(id="evidence.2026-10-20.exotel-india-plumbing", type="evidence", source="verified",
     title="Exotel India plumbing: does - 140-series promo numbers (DLT), NCPR 'whitelist' (callers in last 6 months) plus a signed DND opt-in agreement with CRM lead proof for other NCPR numbers, J&K promo block, claimed NDNC filtering at upload/execution, India region (Mumbai, permanent), post-call PII masking, 1600/1601 allocation under its UL VNO licence (claim); leaves to the buyer - calling windows (09:00-21:00 is guidance, no enforcement documented), recording consent, consent records, opt-out suppression for voice. KYC (company documents, 1-3 business days) gates numbers, the Voicebot applet and AgentStream. No page says AgentStream works on 1600 lines.",
     path=R + "claims.json")
node(id="evidence.2026-10-20.exotel-failure-modes", type="evidence", source="verified",
     title="Exotel failure modes traced to raw threads: AI sales/support non-response (Trustpilot 2026-04-23: a long-time IVR customer got no AI-voice demo in a week; 2.5 TrustScore, 5 reviews all 1-star), billing/hidden charges, outdated UI and hard-to-find recordings (Capterra.in), PSTN compression surprising builders (r/AI_Agents), BYO friction (no SIP REFER, transfer only via Exotel API, LiveKit users proxy through Asterisk), and vendor-admitted Sep 2026 bugs (10 s dead air, 29 s dead calls, mislabelled outcomes, duplicate rows). Campaigns for a bot need two consoles; no AMD on the bot path; one absolute schedule window.",
     path=R + "claims.json")
node(id="evidence.2026-10-20.exotel-memory-marketing-gap", type="evidence", source="verified",
     title="Exotel v2 notes: marketing claims a 'unified memory layer' (CCDP) and a 'Kaizen' self-learning loop; the CCDP docs page is empty, 'Kaizen' is in no doc, and the VoiceBot API has no memory object. Shipped learning primitives are versions with rollback and A/B traffic allocation, transcript feedback categories, call ratings and outcomes; a call evaluator + recommender agent is in testing on production traffic.",
     path=R + "claims.json")
node(id="measure.2026-10-20.exotel-velocity-6mo", type="measurement", status="measured", source="verified",
     title="Exotel velocity 2026-04-20..10-20: 17 engineering posts; new docs pages AgentStream 9, MCP 7, VoiceBot 2; npm exotel-ai-assist 33 releases; ExotelMCP 25 commits / 7 authors; developer changelog stale since 16 Feb 2026; status page 5 unplanned incidents (all 22-23 Jun, posted after the fact) + 42 maintenances, no VoiceBot/AgentStream component, two components stuck at major_outage with no incident.",
     n="17 posts, 87 voice-AI docs pages, 6 npm packages, 3 repos, 9 status-history months",
     method="counted from saved raw files (code/velocity.py): post bylines, docs createdAt, npm time, git log --since, Statuspage history props",
     path=R + "velocity.json")
node(id="rejected.2026-10-20.exotel-rea-bundle-and-har", type="rejection", status="confirmed", source="verified",
     title="REA on Exotel: analyze-web-bundle gave nothing in 300 s on the VoiceBot login page and inspect-web-network-capture rejected a whole HAR over one bracketed tracking-pixel URL.",
     tried="rea-agents 6.7.0 analyze-web-bundle against a headless Chromium CDP target (voicebot.in.exotel.com/voicebot/login, allowed origin, --fetch-source-maps, 4 s observation); inspect-web-network-capture on slimmed Playwright HARs; inspect-web-page on the same target.",
     broke="analyze-web-bundle timed out with empty output (exit 124); inspect-web-network-capture fails closed on a HAR whose URL contains '[ph][0]' (URI validation) and otherwise re-emits records without analysis; inspect-web-page returned script inventory but policy-filtered scripts, storage and websockets. Bundle facts came from Playwright HAR + own extraction and the public source map.",
     path=R + "claims.json")
node(id="risk.2026-10-20.exotel-rails-dependence", type="risk", status="open", source="model",
     title="Riding Exotel AgentStream as VP's carrier carries cost (INR 0.80-1.00/min, 60-s pulses, unpublished stream fee), gating (KYC + email enablement, sales-led pricing), contract (ToS 6.2: customers must not build a competing product, and VP competes with Exotel VoiceBot) and visibility risk (Exotel carries competitors' bot traffic and ships its own bot on the same rails).",
     mitigation="Keep Plivo (or Vobiz) as the primary carrier; use Exotel only where the buyer already holds Exotel or 1600 numbers, under a written partner/BYO agreement that overrides 6.2; get the AgentStream quote and terms in the account phase before any build depends on it.")
node(id="decision.2026-10-20.exotel-rails-not-rival-in-ux", type="decision", source="model",
     title="Proposed: treat Exotel as rails the buyer already has (support AgentStream as a BYO path from day one; the protocol is Twilio-shaped and cheap to add) and as the incumbent whose operational gaps define VP's 'where we win' tasks: one-console list-to-calls with normalisation and opt-out suppression, enforced calling windows and DND/consent records, AMD-aware voicemail handling, failure reasons a human can act on, and same-day self-serve start.",
     rationale="Exotel's bot already shares the WebSocket path any bot can use, so transport is parity, not a moat; its observed weaknesses are in sales responsiveness, two-console campaign flow, advisory-only compliance and docs drift, which match where Indian complaints concentrate (support, account/UI, telephony).",
     reverse_if="Account-phase runs show Exotel completing the fixed task list (CSV with dirty rows, windowed schedule, voicemail + transfer, failure reason, export) in one console within VP's target times, or Exotel publishes self-serve per-minute VoiceBot pricing with same-day activation, or AgentStream terms forbid competing bots.",
     path=R + "predictions.json")
node(id="open.2026-10-20.exotel-account-phase", type="open-question", status="open", source="model",
     title="Exotel account phase (14 pre-registered predictions EXO-P01..P14): does VoiceBot work on a no-KYC trial and only to verified numbers; how long do KYC and AgentStream enablement take; the VoiceBot and AgentStream per-minute quote; two-console campaign flow with the messy CSV; schedule-window enforcement; AMD and transfer; failure reasons; export; handset reply gap, first-audio delay, language hold and AI disclosure on Indian PSTN.",
     closes_when="An Exotel trial (team@vyakti.ai, company KYC) has run the fixed task list twice and the PSTN battery to our Plivo-recorded number, and EXO-P01..P14 are scored with n, method and date.",
     path=R + "predictions.json")

edge("evidence.2026-10-20.exotel-claims", "evidence.2026-10-20.teardown-brief", "derived-from")
edge("evidence.2026-10-20.exotel-claims", "decision.2026-10-20.teardown-launch", "implements")
edge("evidence.2026-10-20.exotel-claims", "directive.2026-10-20.teardown-rea", "implements")
for n in ("evidence.2026-10-20.exotel-rails-for-everyone", "evidence.2026-10-20.exotel-voicebot-architecture", "measure.2026-10-20.exotel-cogs-and-price",
          "evidence.2026-10-20.exotel-india-plumbing", "evidence.2026-10-20.exotel-failure-modes", "evidence.2026-10-20.exotel-memory-marketing-gap",
          "measure.2026-10-20.exotel-velocity-6mo", "rejected.2026-10-20.exotel-rea-bundle-and-har"):
    edge(n, "evidence.2026-10-20.exotel-claims", "part-of")
edge("evidence.2026-10-20.exotel-rails-for-everyone", "ledger.CMP-23", "extends")
edge("evidence.2026-10-20.exotel-rails-for-everyone", "ledger.CMP-22", "supports")
edge("measure.2026-10-20.exotel-cogs-and-price", "rejected.2026-10-17.parity-undercut", "supports")
edge("evidence.2026-10-20.exotel-india-plumbing", "ledger.CMP-27", "supports")
edge("evidence.2026-10-20.exotel-india-plumbing", "open.2026-10-20.presale-vs-postsale", "informs")
edge("evidence.2026-10-20.exotel-india-plumbing", "ledger.REG-25", "leaves-open")
edge("evidence.2026-10-20.exotel-failure-modes", "open.2026-10-20.parity-floor-vs-wedge", "informs")
edge("evidence.2026-10-20.exotel-memory-marketing-gap", "ledger.CMP-01", "supports")
edge("risk.2026-10-20.exotel-rails-dependence", "measure.2026-10-20.exotel-cogs-and-price", "informed-by")
edge("risk.2026-10-20.exotel-rails-dependence", "evidence.2026-10-20.vendor-terms", "informed-by")
edge("risk.2026-10-20.exotel-rails-dependence", "risk.2026-10-20.vendor-terms", "extends")
edge("decision.2026-10-20.exotel-rails-not-rival-in-ux", "evidence.2026-10-20.exotel-rails-for-everyone", "informed-by")
edge("decision.2026-10-20.exotel-rails-not-rival-in-ux", "evidence.2026-10-20.exotel-failure-modes", "informed-by")
edge("decision.2026-10-20.exotel-rails-not-rival-in-ux", "open.2026-10-20.parity-floor-vs-wedge", "informs")
edge("open.2026-10-20.exotel-account-phase", "open.2026-10-20.trial-accounts", "part-of")
edge("open.2026-10-20.exotel-account-phase", "open.2026-10-20.handset-reply-gap", "informs")
edge("open.2026-10-20.exotel-account-phase", "decision.2026-10-20.exotel-rails-not-rival-in-ux", "tests")

events = [{"date": D, "event": "teardown_exotel_done", "source": R + "claims.json",
           "details": "Exotel lane (account-free) finished. Read both docs portals (developer.exotel.com 341 llms.txt pages, 34 still failing after three passes; docs.exotel.com 915 pages), the public VoiceBot console login bundle and WebRTC SDK source map, ExotelMCP / Agent-Stream / ClearStream repos (read-only clones), DNS mapped to AWS regions, Statuspage JSON and history, pricing pages, 17 /build posts, npm release history, Trustpilot (WebFetch), Capterra.in, LiveKit and Exotel community threads. Outputs: claims.json (64), predictions.json (EXO-P01..P14), pricing.json, velocity.json, bundle-endpoints.json, parity-delta.csv, manifest.csv (2,036 files). REA: analyze-web-bundle empty in 300 s; inspect-web-network-capture rejected one HAR on a bracketed URL. Blocked and not bypassed: Trustpilot/G2 curl 403, GitHub API. report.md not written (subagent harness rule); text in the structured output."}]

json.dump({"nodes": N, "edges": E, "events": events}, open(sys.argv[1], "w"), indent=1, ensure_ascii=False)
print(len(N), len(E))
