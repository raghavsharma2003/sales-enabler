"""Graph proposals for the Synthflow lane. Usage: python3 -I build_inbox.py <out.json>"""
import json, sys
D = "2026-10-20"
R = "research/2026-10-20/teardown/synthflow/"
T = "data/teardown/synthflow/"
N, E = [], []
def node(**k):
    k.setdefault("date", D); k.setdefault("source", "verified"); N.append(k)
def edge(a, b, rel): E.append({"from": a, "to": b, "relation": rel})

node(id="evidence.2026-10-20.synthflow-lane", type="evidence", status="proposed",
     title="Synthflow public teardown (account-free): 55 graded claims (46 observed, 7 inferred, 1 vendor-claimed, 1 unknown). Sources: 371 docs pages as Markdown, the OpenAPI spec (69 paths, 110 operations), passive Playwright captures of the site, the React app and the Bubble login, app and widget JS bundles, a public feature-flag snapshot, IP-to-region mapping, DNS, job posts, GitHub, the status feed, Trustpilot and the feedback board. The sha256 manifest covers 486 raw files. report.md was not written (subagent harness rule); its text is in the lane's structured output.",
     path=R+"claims.json")
node(id="evidence.2026-10-20.synthflow-enterprise-gated", type="evidence", status="proposed",
     title="Synthflow has closed self-serve. New accounts 'may be reviewed' before access, the old Pro/Growth/Agency plans are 'no longer sold', and Campaigns, SIP/custom numbers, Aurora, GPT models, BYOK, SSO, the fallback voice and scheduled exports are all Enterprise-only (from $30k/yr). Non-enterprise agents were forced onto 'Synthflow LLM' on 2026-08-25, and a GPT value sent through the API is silently ignored. The 'no-code UX reference' has turned into a sales-led enterprise CX vendor.",
     path=T+"docs-md/account-access-login.md")
node(id="evidence.2026-10-20.synthflow-no-india-path", type="evidence", status="proposed",
     title="Synthflow has no India footprint. Every SIP, media and egress IP maps to GCP us-east1, europe-west3 or northamerica-south1 (one IP is Microsoft); the clusters are Global/US/EU only; numbers can be bought only in the US, Canada and Australia; SIP is Enterprise-only; and the docs never mention TRAI, DLT, NCPR/DND, the 140/160 series or DPDP. Inference: without a custom PoP, an Indian enterprise cannot present a compliant Indian CLI, because Indian trunks need media anchored in India and Twilio dials India only from foreign numbers.",
     path=R+"ip-regions.csv")
node(id="evidence.2026-10-20.synthflow-stack", type="evidence", status="proposed",
     title="Synthflow stack, from public material. Telephony: their own SBCs on ports 32681/32682; the job post names Kamailio, RTPEngine and FreeSWITCH, and there is a public FreeSWITCH fork. Browser calls and live listen-in go through a Janus gateway (janode, AudioBridge, TURN relay forced); custom web integration uses raw WebSocket media. STT is Deepgram (Nova-3 multi matches their 'Multilingual' list word for word) plus Soniox and 'Synthflow STT'. TTS is ElevenLabs plus Deepgram Aura-2 and 'Synthflow TTS'. LLMs are OpenAI-only plus an undisclosed 'Synthflow LLM'. Aurora (builder copilot) routes between Claude Sonnet and Haiku. Orchestration is in-house and probably Python/aiohttp. LiveKit appears only as a 2024 dev Egress service account, so the 'Pipecat/LiveKit' hypothesis is not supported.",
     path=T+"extracted/app/app.synthflow.ai_assets_index-boN6ncNO.js")
node(id="measure.2026-10-20.synthflow-india-allin-price", type="measurement", status="measured",
     title="Estimated cost of a Synthflow Indian outbound minute: INR 15.2-18.0 (last public platform rate $0.11-0.14 plus BYO Twilio to an Indian mobile at $0.0496, FX 95), on top of the $30k/yr (INR 28.5 lakh) floor. Effective cost is INR 47.5/min at 5k min/month and INR 23.75 at 10k. Reconstructed COGS on a third-party stack is $0.034-0.085/min (INR 3.2-8.1), a 39-69% gross margin. Inference from list prices, not an invoice.",
     n="6 price inputs (enterprise floor, H1-2026 voice-engine and LLM rates, Twilio India mobile, Deepgram/OpenAI/ElevenLabs list ranges via the vapi lane)",
     method="computed in code/pricing.py from synthflow.ai/pricing (2026-10-20), pricing-history.json (Common Crawl 2026-03/06) and research/2026-10-20/teardown/vapi/pricing.json",
     path=R+"pricing.json")
node(id="measure.2026-10-20.synthflow-velocity-reliability", type="measurement", status="measured",
     title="Synthflow velocity and reliability: 67 dated changelog entries in the six months to 2026-10-20 (10-12 a month since March, against 1-5 a month in 2025). The new incident.io status page (history only from 2026-07-16) shows 3 incidents in 10 weeks: 2026-08-07, post-call AI outputs empty for 2 h 50 m after a model-restriction change while webhooks still fired; 2026-08-17, calls down 9-12 min and warm transfers failing 3 h 42 m; 2026-09-07, white-label login.",
     n="106 changelog entries (67 in window); 11 status RSS items",
     method="parsed docs.synthflow.ai changelog pages (code/changelog.py) and status.synthflow.ai/feed.rss, read 2026-10-20",
     path=R+"changelog.csv")
node(id="evidence.2026-10-20.synthflow-campaign-compliance-gaps", type="evidence", status="proposed",
     title="Campaign plumbing is thin and leaves compliance to the buyer. Campaigns can only be created through the API (Enterprise, since 2026-08-18). Failed recipients are not retried, a campaign is cut off after 7 days, the window cannot cross midnight or be edited, and agent hours that conflict with it fail recipients outright. Contacts have no consent, opt-out or DND fields and there is no suppression list; opt-out exists only as a post-call LLM-judge flag (no_opt_out). End reasons in analytics key on raw strings, including Python exceptions. These are task-level places where VP can be measurably better.",
     path=T+"docs-md/batch-calling.md")
node(id="measure.2026-10-20.synthflow-trustpilot-codes", type="measurement", status="measured",
     title="Synthflow Trustpilot low-star reviews coded: 21 product reviews (2024-05 to 2026-05; TrustScore 4.1 over 215). SUPPORT 19, BILLING 11, RELIABILITY 9, PLAN_GATING 4, TELEPHONY 3, the same order as the 2026-10-17 VoC (support > billing > reliability).",
     n="21 reviews (1-2 star, 2 pages; 1 employer review excluded)",
     method="WebFetch extraction of trustpilot.com/review/synthflow.ai?stars=1&stars=2 on 2026-10-20 (curl got 403, not bypassed); hand-coded with the l4a taxonomy",
     path=T+"complaints/trustpilot-webfetch-2026-10-20.json")
node(id="evidence.2026-10-20.synthflow-v2-memory-learning", type="evidence", status="proposed",
     title="v2 notes: Synthflow memory groups inject per-contact summaries at call start, matched by phone number and shared across voice, SMS and WhatsApp; the backend is moving from Postgres to a Memory Service. Learning is marketing-only: 'agents improve continuously' and 'Data Fine-Tuning' (future tense) appear on the site, while the docs' Learn step is analytics, logs and export plus Aurora prompt review. There is no automated optimisation and no A/B testing.",
     path=T+"docs-md/memory.md")
node(id="evidence.2026-10-20.synthflow-homepage-demo-s2s", type="evidence", status="proposed",
     title="Correction to the l4b 2026-10-17 record ('Synthflow: recorded samples only'). Synthflow now has a live homepage voice widget ('Conductor', on Fly.io): raw PCM16 at 24 kHz over WebSocket, gated by Cloudflare Turnstile and an email OTP. Its agent table maps to speech-to-speech models (gpt-realtime-2, gpt-realtime-mini, gemini-3.8-live), so the marketing demo is not the product cascade. It was not exercised because the OTP and bot-protection boundary forbids it.",
     path=T+"extracted/widget/conductor-webwidget-synthflow-homepage.fly.dev_widget.js")
node(id="rejected.2026-10-20.synthflow-rea-bundle", type="rejection", status="confirmed",
     title="REA analyze-web-bundle on Synthflow's React app over CDP.",
     tried="rea-agents@latest (6.7.0) analyze-web-bundle against a headless Chromium CDP target on app.synthflow.ai with --observation-ms 5000 --fetch-source-maps.",
     broke="No stdout or stderr within 300 s; killed by timeout (the vapi lane saw the same). inspect-web-network-capture on the 10 MB HAR ran in 3.7 s but returned only a 10 MB lossless envelope with no summary, and --token-limit is refused for structured output. Workaround used: Playwright HAR plus our own extraction of bundles and flags.",
     path=T+"rea/app-analyze-web-bundle.status.json")
node(id="open.2026-10-20.synthflow-account-phase", type="open-question", status="open",
     title="Synthflow account phase: a trial may be unobtainable. Self-serve is not sold and sign-ups are reviewed, so the fixed task list, the Indian PSTN battery and the STT/TTS fingerprinting (what is 'Synthflow LLM/STT/TTS'?) need either an approved workspace or a sales-led sandbox. 13 predictions (SYN-P01..P13) are pre-registered, including first live call >24 h after sign-up and handset reply gap p50 >=1.6 s.",
     closes_when="Owner decides whether a sales conversation is acceptable. Then team@vyakti.ai either gets a workspace and the predictions are scored, or the review gate refuses and that refusal is logged as the onboarding result.",
     path=R+"predictions.json")

for n in N[1:]:
    edge(n["id"], "evidence.2026-10-20.synthflow-lane", "part-of")
edge("evidence.2026-10-20.synthflow-lane", "evidence.2026-10-20.teardown-brief", "derived-from")
edge("evidence.2026-10-20.synthflow-lane", "decision.2026-10-20.teardown-launch", "implements")
edge("evidence.2026-10-20.synthflow-no-india-path", "ledger.CMP-27", "supports")
edge("evidence.2026-10-20.synthflow-campaign-compliance-gaps", "ledger.CMP-27", "supports")
edge("evidence.2026-10-20.synthflow-enterprise-gated", "ledger.CMP-18", "supports")
edge("measure.2026-10-20.synthflow-india-allin-price", "ledger.CMP-18", "extends")
edge("measure.2026-10-20.synthflow-india-allin-price", "rejected.2026-10-17.parity-undercut", "informs")
edge("evidence.2026-10-20.synthflow-campaign-compliance-gaps", "directive.2026-10-20.product-brief", "informs")
edge("evidence.2026-10-20.synthflow-enterprise-gated", "decision.2026-10-17.beachhead-v2", "informs")
edge("evidence.2026-10-20.synthflow-stack", "ledger.CMP-01", "informs")
edge("open.2026-10-20.synthflow-account-phase", "decision.2026-10-20.teardown-launch", "leaves-open")

ev = [{"date": D, "event": "teardown_synthflow_done", "source": R + "claims.json",
       "details": "Synthflow lane (account-free) finished. Read 371 docs pages and the OpenAPI spec (110 ops); captured synthflow.ai, app.synthflow.ai and fine-tuner.ai/auth passively; parsed app and widget bundles and the public Flipt snapshot (60 flags); mapped IPs to GCP regions; resolved DNS; read job posts, GitHub, the status RSS, Trustpilot (WebFetch) and the feedback board. Outputs: claims.json (55), predictions.json (SYN-P01..P13), pricing.json, changelog.csv, ip-regions.csv, parity-delta.csv, manifest.csv (486 files). Not done: homepage demo call (email OTP + Turnstile), G2/Capterra/Reddit (blocked), security.synthflow.ai (Cloudflare challenge). REA analyze-web-bundle hung 300 s. report.md not written (harness rule); its text is in the structured output."}]
json.dump({"nodes": N, "edges": E, "events": ev}, open(sys.argv[1], "w"), indent=1, ensure_ascii=False)
print(len(N), "nodes", len(E), "edges")
