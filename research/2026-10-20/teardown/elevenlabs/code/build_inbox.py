"""Writes context/inbox/teardown-elevenlabs.json (graph proposals). Run from repo root:
python3 -I research/2026-10-20/teardown/elevenlabs/code/build_inbox.py"""
import json, os
T = 'research/2026-10-20/teardown/elevenlabs/'
D = 'data/teardown/elevenlabs/'
DATE = '2026-10-20'
N, E = [], []
def node(**k):
    k.setdefault('date', DATE); N.append(k); return k['id']
def edge(a, b, rel): E.append({'from': a, 'to': b, 'relation': rel})

claims = node(id='evidence.2026-10-20.elevenlabs-claims', type='evidence', status='proposed', source='verified',
    title='ElevenLabs Agents public teardown (account-free): 56 graded claims (44 observed, 9 inferred, 3 vendor-claimed) from the 804-page docs index (258 pages saved as Markdown), the public OpenAPI (322 paths, 141 convai), pricing pages, 32 changelog entries, the incident.io status feed, 6 npm SDKs and the PyPI SDK, DNS/RDAP of 19 hostnames, passive captures of elevenlabs.io/agents and the signed-out app, one 25 s public demo call, 157 job posts, Trustpilot, GitHub issues and HN. sha256 manifest of 3,809 raw files.',
    path=T + 'claims.json')
edge(claims, 'evidence.2026-10-20.teardown-brief', 'derived-from'); edge(claims, 'decision.2026-10-20.teardown-launch', 'implements')

camp = node(id='evidence.2026-10-20.elevenlabs-hidden-campaigns', type='evidence', status='proposed', source='verified',
    title='ElevenLabs is building a lead-level outbound campaign product that is not public yet. The signed-out dashboard bundle carries 23 unpublished /v1/convai/outbound-campaigns routes: campaigns submit/pause/resume/stop/progress/export, leads with suppressLead, an attention queue (resolve/retry), workspace config and pre-revoke-status. Conversation records already carry campaign_id, campaign_lead_id, cold_attempt and conversation_type (initial/retry/callback/redirect). The public product is still single-start batch calling with no calling window, retry policy or suppression. Of 568 convai routes in the bundle, 326 are absent from the public OpenAPI (also automations, task-agents, memories, templates).',
    path=T + 'bundle-endpoints.json')
edge(camp, claims, 'part-of'); edge(camp, 'open.2026-10-20.parity-floor-vs-wedge', 'informs'); edge(camp, 'rejected.2026-10-17.parity-undercut', 'supports')

sip = node(id='evidence.2026-10-20.elevenlabs-india-residency-sip-region', type='evidence', status='proposed', source='verified',
    title='ElevenLabs has an India data-residency environment, but only on Enterprise. The 2026-10-17 parity row "no India region found" is wrong. in.residency.elevenlabs.io is a separate workspace: storage is in India, "processing may nevertheless occur outside", Realtime v1 Max is not offered there and agents are not migrated. DNS shows SIP is regional: sip.rtc.elevenlabs.io is in GCP us-central1 and sip.rtc.in.residency.elevenlabs.io is in asia-south1 (Mumbai). The static-IP SIP /24 (199.88.252.0/24) is registered to Eleven Labs Inc. Inference: a self-serve Indian buyer on SIP has media anchored in Iowa, adding about one India-US round trip (~200-250 ms) per turn, and faces the TRAI rule that Indian SIP termination needs an Indian server.',
    path=D + 'net/doh-sip.rtc.in.residency.elevenlabs.io.json')
edge(sip, claims, 'part-of'); edge(sip, 'open.2026-10-20.handset-reply-gap', 'informs'); edge(sip, 'ledger.CMP-23', 'extends')

exo = node(id='evidence.2026-10-20.elevenlabs-exotel-native', type='evidence', status='proposed', source='verified',
    title='Exotel has been a first-class ElevenAgents telephony provider since 2026-06-01, alongside Twilio and SIP. Exotel\'s Voicebot applet streams 8 kHz PCM over a WebSocket to ElevenLabs; outbound uses Exotel Calls/connect with the buyer\'s own keys; the Mumbai and Singapore clusters are supported. Friction: Exotel support must first enable the gated Voicebot applet and provision channels (1-2 business days), and transfer needs a chained Connect applet. This is the self-serve route to a domestic Indian CLI that Vapi lacks. The India page also claims Ozonetel and Plivo integrations and Indian agent customers (Meesho, Cars24, TVS Motor; vendor-claimed).',
    path=D + 'docs-md/eleven-agents__phone-numbers__telephony__exotel.md')
edge(exo, claims, 'part-of'); edge(exo, 'open.2026-10-20.parity-floor-vs-wedge', 'informs'); edge(exo, 'ledger.CMP-23', 'extends')

comp = node(id='evidence.2026-10-20.elevenlabs-no-india-compliance', type='evidence', status='proposed', source='verified',
    title='ElevenAgents leaves Indian calling compliance to the buyer. The 258 saved docs pages never mention TRAI, DLT, NCPR/DND, the 140/160 series or Indian calling hours; the only telemarketing-law page is TCPA. The public batch API has no calling-window, DNC, consent or suppression field. AI disclosure and recording consent are contractual duties of the buyer. Twilio regional routing offers only us1/ie1/au1.',
    path=D + 'docs-md/eleven-agents__legal__tcpa.md')
edge(comp, claims, 'part-of'); edge(comp, 'ledger.CMP-27', 'supports'); edge(comp, 'open.2026-10-20.presale-vs-postsale', 'informs')

price = node(id='measure.2026-10-20.elevenlabs-india-all-in-price', type='measurement', status='measured', source='verified',
    title='ElevenAgents all-in list price for an Indian outbound minute at FX 95: INR 8.17-8.92 via Exotel or Plivo, INR 15.8-16.5 in burst, INR 12.5-15.0 via Twilio. The platform fee is $0.08 = INR 7.60 on every plan and is unchanged in USD since 2026-06-06. The rest is LLM pass-through (INR 0.19-0.72) and telephony (INR 0.38-0.60). The $0.08 fee is 3.9x the same ASR and TTS on ElevenLabs\' own API list. Reconstructed platform COGS of INR 0.20-1.38/min implies an 82-97% gross margin (inference, not measured).',
    n='4 price components (platform, burst, LLM pass-through range from g4 workload, telephony range) + 3 own-API list prices',
    method='computed from elevenlabs.io/pricing/agents and /pricing/api read 2026-10-20, g4 prices.csv/selfhost tables and l2 telephony rates (code/pricing.py); list prices, not an invoice',
    path=T + 'pricing-allin.json')
edge(price, claims, 'part-of'); edge(price, 'rejected.2026-10-17.parity-undercut', 'supports')

vel = node(id='measure.2026-10-20.elevenlabs-velocity-incidents', type='measurement', status='measured', source='verified',
    title='ElevenLabs velocity and reliability. From 2026-04-01 to 2026-10-12 there were 32 changelog entries (about weekly) with 296 headline items, 195 of them for ElevenAgents (median 6 per entry), plus weekly SDK releases (JS/Python 2.74 on 2026-10-20). The status feed (incident.io) shows 25 incidents from 2026-07-31 to 2026-10-13: 9 name Agents, SIP, Twilio, batch calling or conversation history, 4 are SIP/Twilio telephony and 5 are EU-residency.',
    n='32 changelog entries; 25 status incidents',
    method='elevenlabs.io/docs/changelog/llms.txt and each entry .md (items counted per section by code), status.elevenlabs.io/feed.rss parsed; fetched 2026-10-20',
    path=T + 'velocity.json')
edge(vel, claims, 'part-of')

v2 = node(id='evidence.2026-10-20.elevenlabs-v2-memory-loop', type='evidence', status='proposed', source='verified',
    title='ElevenLabs v2 signals.\n- Memory across calls is undocumented but in the data model: memory entries with version and a conversation/manual source. The dashboard calls /agents/{id}/memories and /agents/{id}/user-memory/preview.\n- Personalisation today is per call only: dynamic variables, overrides and user_id.\n- The improvement loop is human-gated: Spotlight finds an issue, Architect proposes a branch with tests, a teammate merges, and experiments split traffic with manual promotion.\n- "Proactive proposals" and scheduled automations are announced; the bundle already calls /convai/automations and /triage-tickets/{id}/architect-dispatches.',
    path=T + 'bundle-endpoints.json')
edge(v2, claims, 'part-of'); edge(v2, 'directive.2026-10-20.harness2-later', 'informs'); edge(v2, 'ledger.LRN-09', 'extends')

dec = node(id='decision.2026-10-20.elevenlabs-strongest-india-rival', type='decision', status='proposed', source='model',
    title='Proposed: treat ElevenLabs Agents as the strongest global rival for Indian enterprise voice. It is not just a TTS vendor: it has India residency, native Exotel, Indian GTM hires and Indian agent logos, and a campaign product in the pipeline. Score VP against it on five runnable tasks:\n- handset reply gap on Indian PSTN on a standard (non-Enterprise) plan;\n- Hinglish language hold on the default configuration;\n- recurring 09:00-21:00 IST windows with per-lead retries and suppression;\n- messy-CSV hygiene (+91 normalisation, dedupe, opt-out);\n- Indian carrier and regulatory failure reasons in plain language.',
    rationale='Public evidence shows ElevenLabs owns the speech stack (ASR, TTS, turn model, S2S), ships ~6 agent features a week, already solved domestic Indian telephony through Exotel, and is building leads/suppression/retries; its platform margin is 82-97% (inferred) so a price cut is cheap for it. Its public gaps for Indian outbound are regional processing for self-serve buyers, Indian compliance controls, Hinglish handling and India-specific failure reasons.',
    reverse_if='ElevenLabs makes outbound campaigns public with calling windows and suppression and offers India-region processing on self-serve plans; or the account phase measures handset p50 <= 1.5 s with >= 90% Hinglish language hold on the default configuration; or it prices Indian minutes at or below INR 4 all-in.')
edge(dec, claims, 'derived-from'); edge(dec, 'open.2026-10-20.parity-floor-vs-wedge', 'informs'); edge(dec, 'open.2026-10-20.presale-vs-postsale', 'informs')

risk = node(id='risk.2026-10-20.elevenlabs-campaigns-and-price', type='risk', status='open', source='model',
    title='Within about one quarter, ElevenLabs could launch its hidden outbound-campaigns product (leads, retries, suppression) and cross-call memory, and cut its Indian price toward INR 4/min. A 82-97% platform margin (inferred) makes the cut affordable. That would close the usability and price gaps VP is targeting, leaving only India-resident latency, compliance and Hinglish quality.',
    mitigation='Re-run code/bundle_endpoints.py weekly against the signed-out app bundle and the public OpenAPI (radar watchlist), and diff the changelog. Build VP\'s Indian operator layer (DLT/140-160 declaration, NCPR scrub, consent ledger, IST windows, business-language outcomes) as the product, and keep India-resident processing on every plan.')
edge(risk, camp, 'derived-from'); edge(risk, price, 'derived-from')

op = node(id='open.2026-10-20.elevenlabs-account-phase', type='open-question', status='open', source='model',
    title='Do the pre-registered ElevenLabs account-phase predictions EL-P01 to EL-P12 hold?\n- Web call within 10 min, but an Indian-handset call takes >= 30 min via Twilio and >= 1 business day via Exotel.\n- The CSV keeps duplicates and the opt-out row and does not prefix +91.\n- There is no calling window.\n- LLM voicemail detection misses Indian operator announcements.\n- Handset reply gap p50 is 2.0-3.2 s on a standard plan.\n- There is no cross-call memory by default.',
    closes_when='An ElevenLabs trial (the existing free account from the Instinct report, plus an Exotel or Twilio number) runs EL-P01 to EL-P12. That needs timed screen recordings, the 50-row CSV outcome per row, a scheduling attempt, three Indian operator announcements, the l4b battery on our Plivo/Exotel number (>= 30 clean turns, stereo), the invoice lines, and a check whether outbound-campaigns or memory is visible in the workspace.',
    path=T + 'predictions.json')
edge(op, 'open.2026-10-20.trial-accounts', 'part-of'); edge(op, 'open.2026-10-20.handset-reply-gap', 'informs'); edge(op, 'evidence.2026-10-20.trial-accounts-report', 'informed-by')

asset = node(id='asset.2026-10-20.bundle-vs-openapi-diff', type='asset', status='proposed', source='verified',
    title='Reusable unreleased-feature detector. bundle_endpoints.py pulls the generated API-client routes out of a signed-out dashboard\'s JS, using string matching only (nothing is executed), and diffs them against the vendor\'s public OpenAPI. With capture.mjs, har_scripts.py and har_slim.py it turns one passive sign-in page load into a list of unpublished product surfaces.',
    paths=[T + 'code/bundle_endpoints.py', T + 'code/capture.mjs', T + 'code/har_scripts.py', T + 'code/har_slim.py', T + 'code/fetch.sh', T + 'code/build_manifest.py'],
    value='Found ElevenLabs outbound-campaigns, memories, automations and task-agents (326 unpublished routes) before any announcement. It runs weekly as change-watch on any vendor whose dashboard ships a generated client (Fern, OpenAPI codegen).',
    effort='about 1 minute per vendor per run, with no account')
edge(asset, camp, 'from')

ev = [{'date': DATE, 'event': 'teardown_elevenlabs_done', 'source': T + 'claims.json',
       'details': 'ElevenLabs Agents lane (account-free) finished. Work done:\n- read the 804-page llms.txt (258 pages saved), the OpenAPI (322 paths), pricing, 32 changelog entries and the status RSS;\n- unpacked 6 npm SDKs and the PyPI wheel;\n- resolved 19 hostnames (DoH) and matched them to GCP ranges and RDAP;\n- captured elevenlabs.io/agents and the signed-out app, and made one 25 s public demo call (WebSocket, react_sdk 0.14.0-beta.0);\n- read 157 job posts, Trustpilot, GitHub issues and HN via WebFetch/Algolia.\nOutputs: claims.json (56), predictions.json (EL-P01..P12), pricing-allin.json (INR 8.17-8.92/min via Exotel/Plivo), bundle-endpoints.json (326 unpublished convai routes, incl. outbound-campaigns and memories), velocity.json and manifest.csv (3,809 files).\nREA: inspect-web-network-capture needed percent-encoded URLs, then gave no stack inference; analyze-javascript-application ran in 6 s but left host literals unresolved.\nBlocked and not bypassed: Reddit, G2, the GitHub API and curl HTML (403).'}]
out = {'nodes': N, 'edges': E, 'events': ev}
os.makedirs('context/inbox', exist_ok=True)
json.dump(out, open('context/inbox/teardown-elevenlabs.json', 'w'), indent=1)
ids = {n['id'] for n in N}
g = json.load(open('context/graph.json')); gids = {n['id'] for n in g['nodes']}
bad = [e for e in E if e['to'] not in ids | gids or e['from'] not in ids | gids]
paths = [p for n in N for p in ([n['path']] if 'path' in n else []) + n.get('paths', []) if not os.path.exists(p)]
print(len(N), 'nodes', len(E), 'edges', 'bad edges', bad, 'missing paths', paths)
