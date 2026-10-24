The radar lane is done, account-free: public pages and passive page loads only, with no sign-ups, forms, demo requests or calls. The harness refused report.md (subagents may not write report .md files), so the report is this summary, and the four other required outputs are written.

Scope: ~40 vendors outside the deep set, plus a sweep for new entrants since 2026-04. Evidence base: 52 passive Playwright page loads (HAR, rendered text, request hosts, websockets), docs indexes, pricing pages, PyPI/npm JSON, status endpoints, press pages, and new-entrant searches (HN Algolia, Inc42, YourStory, web search). 282 raw files sit under data/teardown/radar with a sha256 manifest. 59 claims are graded: 35 observed, 12 vendor-claimed, 10 inferred, 2 unknown.

HEADLINE
1. Swap Synthflow out of the deep set and put Gupshup Voice AI in.
   - Synthflow is enterprise-only from USD 30k/yr, so the account phase cannot run on it (RAD-54).
   - Gupshup launched a self-serve console on 2026-09-04. It offers 100 free minutes, prices "from INR 3.50/min" (RAD-01, vendor-claimed) and has owned Indian numbers through Knowlarity plus BYO Twilio/Plivo, SIP and WhatsApp voice (RAD-02, observed).
   - First alternate: Ringg. Second alternate: Smallest. Gnani is desk-deep only.
2. New money went to BFSI specialists, and one names our beachhead.
   - Seven Indian rounds in the window (RAD-49): Vobiz USD 1M, Smallest USD 13M, Ringg USD 10M, Navana INR 40 Cr, Dialflo USD 180K, Desible INR 32 Cr, RevRag USD 2.5M.
   - Desible's homepage lists a "Policy Renewal Agent" and an "Insurance Post-Sales & Onboarding Agent" (RAD-43).
   - Navana claims 100M+ BFSI minutes (RAD-42). Gnani publishes no price and claims 12M+ renewals (RAD-09/10).
   - None of the three can be trialled.
3. Sellers are packaging the operation, not the tool (RAD-50, inferred).
   - MyOperator withdrew its INR 5/min AI plan. It now sells a custom plan in which a human "AI Agent Manager" builds, monitors and tunes the agents (RAD-15, observed; contradicts the pricing-history 2026-06 row).
   - Samora (YC W26) escalates to trained human operators.
   - Tata/TTBS and Caller.digital price per outcome.
4. Testing and WhatsApp are now parity, not wedges.
   - Pre-deploy simulation/evals ship at 6 vendors (RAD-52).
   - Voice+WhatsApp in one agent is at 6+ vendors (RAD-53). This extends the l4a finding, which had it native only at Ringg and ElevenLabs.
5. Caller.digital publishes the first itemised Indian cost stack (RAD-18, observed).
   - INR 10.15/min = carrier 1.04 + STT 0.73 + LLM 0.62 + TTS 1.68 + server 0.84 + LiveKit 0.14 + support 2.10 + platform 3.00.
   - The AI layers are INR 3.02 and support plus platform fee are about half the price (RAD-19, inferred).
   - It contradicts ledger CMP-16.

RADAR (threat 1-5, rubric-scored; full table in radar.csv)
- 4: Gupshup Voice AI (promote); Ringg (INR 6 all-in, widest Indian BYOT list: Exotel/Plivo/Twilio/Ozonetel/Vobiz/Tata/SIP); Smallest Atoms (USD 0.09-0.21; Hindi code-switching TTS; Series A); Gnani (desk-deep).
- 3: Ozonetel; Tata Comms+TTBS (new; Commotion at gocommotion.com; outcome pricing; re-triage 2026-11-20); Navana; Plivo AI agents (two pages now 404); Ultravox (USD 0.05 incl. TTS; Plivo config); Caller.digital; MyOperator; Cartesia Managed Agents (USD 0.06 + 0.014); Desible (beachhead flag); Arrowhead; BlueMachines; Edesy; Haptik (/voice-ai 404); LiveKit (India region, USD 0.01/min, WhatsApp connector); Yellow.ai; Nurix; Ravan (from 2 cents/min; language claims contradict each other).
- 2: Deepgram agent API (USD 0.041-0.163); Pipecat (1.13.0 on 10-19); PolyAI (new Dialog-RSN-1 API at 2 cents/min + tokens, USD 100 credit); RevRag; Samora; Dialflo; OpenAI GPT-Live-1 (USD 0.05 flat); ThunderPhone 2.0 (2 cents, US); Millis (pricing page 404); Bland (USD 0.14, no Indic); Vobiz (supplier); others carried from l4a.
- 1: Coval, Hamming, Hume (all evaluation tools; Hume repositioned to evaluation). Air.ai exited: its domain now serves a defence product (RAD-31), and the FTC sued it in Aug 2025.

STACK
- Marketing pages do not reveal the call stack: no voice or WebRTC socket opened on any of the 52 loads (RAD-59).
- Every stack we could identify is LiveKit: Smallest and Cartesia demos (l4b) and Caller.digital's own cost line (RAD-55, inferred).
- Observed hosting:
  - Bland calls Google Cloud Run.
  - Gupshup's console is a static app on S3 + CloudFront.
  - ThunderPhone replays sessions through OpenReplay on Azure.

WHAT IT MEANS FOR THE THREE DECISIONS
(1) Pre-sale or post-sale first.
- Post-sale BFSI, renewals included, is where funded specialists are concentrating (Desible, Navana, Gnani).
- That makes beachhead-v2 more contested than r2 showed. It supports rejected.thin-competition.
- SMB pre-sale is being entered by carriers and CPaaS players with owned numbers (Tata/TTBS, Gupshup).
- Buyer interviews must ask about Desible, Navana and Gnani by name.
(2) Parity floor additions (Kano guesses, to test in interviews).
- Must-be:
  - Indian numbers or BYOT (Exotel, Plivo, Vobiz, Tata, Ozonetel);
  - voice+WhatsApp follow-up;
  - pre-deploy simulation and test calls;
  - per-second or per-connected-minute billing;
  - human hand-off.
- Performance: a headline price of INR 3.5-6.
(3) Where we can be measurably better.
- The strongest signal: a product that does the human "AI agent manager" job, i.e. find failed calls, explain why, propose and A/B-test the fix.
  - Proving task: time-to-diagnose and time-to-fix on a seeded failure set, against Gupshup and Ringg trials.
- Measured Hinglish quality on Indian PSTN is a second claim no radar vendor publishes.
- v2 memory: only Ravan claims "agent memory" (vendor-claimed).

TRIAGE RUBRIC (proposed; also in watchlist.json)
- Sub-scores 0-3, weighted: buyer overlap B ×3, Indian telephony T ×2, Indic evidence L ×2, published price pressure P ×1, self-serve S ×1, 6-month momentum M ×1.
- Threat = 1 + round(4·Σ/30). Evaluation tools and exited vendors are capped at 1.
- Promote only if threat ≥4, B ≥2, T ≥2, the vendor is account-testable, and it displaces the deep-set member that yields the least account-phase data. Enterprise-only vendors that pass become "desk-deep only".
- Renewal-beachhead overlap is flagged separately, because the rubric under-weights enterprise-only specialists.
- Re-triage triggers: a round ≥ USD 5M; an all-in price ≤ INR 4; a new Indian telephony integration; a named BFSI/insurer customer; a self-serve launch; a deep-set vendor going enterprise-only.

CHANGE-WATCH
- watchlist.json holds 67 URLs, each with a baseline sha256 and a diff method: 59 deep-set (pricing, changelog, llms.txt, sitemaps, status endpoints, PyPI/npm) and 8 radar.
- Status endpoint types: Statuspage JSON (Retell, Exotel), incident.io RSS (ElevenLabs, Sarvam, Synthflow), Better Stack (Vapi, Bolna).
- 9 sweep sources were probed: 5 work from the sandbox; Product Hunt is 403 and the Entrackr feed is 404.
- Scripts are in code/.
- Expect sha256 churn from build IDs in the HTML. The normalised-text diff is the real signal.

CORRECTIONS TO EARLIER ROWS
- Contradicts:
  - pricing-history MyOperator 2026-06 row (RAD-15);
  - ledger CMP-16 on Caller.digital (RAD-18).
- Updates:
  - Ravan tiers (RAD-29);
  - l7 Pipecat version (RAD-37);
  - l4a voice+WhatsApp finding (RAD-53).
- Unresolved: Ringg's "monthly minimum" is not in the rendered page today (RAD-07).
- Confirms:
  - Bland, Ringg and Smallest prices;
  - Bland names no Indic language;
  - Hume's repositioning to evaluation.

LIMITS
- No product was used: quality claims are vendor claims or earlier demo measurements.
- New-entrant figures come from press and are graded vendor-claimed.
- The 10 rows carried from l4a were not re-read.
- knowlarity.com failed TLS validation and was not bypassed.
- Rubric weights are a proposal and are not validated.

INBOX
- context/inbox/teardown-radar.json holds 14 nodes, 18 edges and 1 event.
- A dry-run merge plus context:check on a scratch copy of the graph passed (1058 nodes valid).
- The real graph.json was not touched. Nothing was committed or pushed.

---

## Structured result (from the workflow run wf_560edf6c-5d6, public-material phase)

### Key findings

- Deep-set swap proposed: Synthflow out (enterprise-only from USD 30k/yr, so no account-phase data), Gupshup Voice AI in. Gupshup is self-serve (launched 2026-09-04), offers 100 free minutes, prices 'from INR 3.50/min' and has owned Indian numbers via Knowlarity plus BYO Twilio/Plivo, SIP and WhatsApp voice. Ringg is the first alternate and Smallest the second; Gnani is desk-deep only (RAD-01/02/54).
- Seven Indian voice-AI rounds were reported in the 2026-04..10 window. Of the five agent companies among them, three are BFSI-workflow specialists. Desible.ai (INR 32 Cr, 2026-10-07) lists a 'Policy Renewal Agent' and an 'Insurance Post-Sales & Onboarding Agent' on its homepage. Navana (INR 40 Cr, 2026-09-07) claims 100M+ BFSI minutes. This challenges decision.2026-10-17.beachhead-v2 and supports rejected.2026-10-17.thin-competition (RAD-42/43/49).
- MyOperator withdrew its INR 10,000 / 2,000-minute AI plan for a custom 'Business AI Operator' plan with a dedicated human AI Agent Manager (observed). Samora escalates to trained human operators; Tata/TTBS and Caller.digital price per outcome. Inference: buyers pay for someone to run and tune agents, which makes the operator layer a candidate 'where we win' (RAD-15/50).
- Caller.digital publishes an itemised INR stack: Growth 10.15/min = carrier 1.04 + STT 0.73 + LLM 0.62 + TTS 1.68 + server 0.84 + LiveKit 0.14 + support 2.10 + platform 3.00 (PAYG BYOK 9.42). AI layers are about 30% of the price. This contradicts ledger CMP-16 (RAD-18/19).
- Parity-floor additions (inferred): pre-deploy simulation/evals ship at Gupshup, Cartesia, LiveKit, PolyAI, ThunderPhone and Ringg; voice+WhatsApp in one agent is at 6+ radar vendors, extending the l4a finding that only Ringg and ElevenLabs had it (RAD-52/53).
- Indian headline price floor is INR 3.50/min from Sarvam (plus INR 0.40 telephony) and Gupshup (telephony inclusion not stated); Ringg is unchanged at INR 6 all-in. New cheap brains: PolyAI's Dialog-RSN-1 API at 2 cents/min + tokens (USD 100 credit) and OpenAI GPT-Live-1 at a flat USD 0.05/min (RAD-33/36/51).
- Carriers and CPaaS are moving up into agents: Gupshup+Knowlarity, Tata Communications+TTBS on Commotion (gocommotion.com, SMB, outcome-priced) and Exotel AgentStream. Plivo's own agent pages are now 404 (RAD-40/41/48).
- Ringg has the widest Indian BYOT list seen: Exotel, Plivo, Twilio, Ozonetel, Vobiz, Tata Tele, plus SIP with REFER transfers (RAD-08). Gnani publishes no price, and inya.ai redirects to gnani.ai (RAD-09).
- Stack: none of the 52 passive page loads opened a voice or WebRTC socket. Every radar stack identifiable from public material is LiveKit (Smallest and Cartesia demos in l4b; Caller.digital's own cost line). Pipecat 1.13.0 shipped 2026-10-19 and LiveKit made 41 releases in 6 months (RAD-37/55/59).
- Radar hygiene: Air.ai exited (its domain now serves a defence readiness product; FTC case Aug 2025) and is dropped; Hume repositioned to evaluation; Millis's pricing page is 404 behind a Webflow template and its homepage gives two different latency figures; Ravan's language counts contradict each other on one site; Bland names no Indic language (RAD-26/28/30/31/35).

### Pre-registered predictions for the account phase

- Gupshup Voice AI's 'from INR 3.50/min' excludes telephony and/or premium voices: a trial invoice shows all-in >= INR 4.50 per connected minute on a Hindi agent calling an Indian mobile.
- Gupshup's Hindi agent on our PSTN battery has clean-turn p50 >= 2.0 s (handset side) and cuts into the elderly ~2.4 s pause in >= 1 of 2 calls.
- Ringg still enforces a monthly minimum on self-serve (stated in its FAQ or at checkout) of >= INR 5,000/month.
- Smallest Atoms' agent on a Hindi persona discloses being an AI when asked 'aap AI ho?' in <= 1 of 2 calls without an explicit disclosure instruction.
- By 2026-11-20, at least one more Indian voice-AI vendor on the radar publishes outcome-based (per-resolution or per-collection) pricing.
- Desible.ai or Navana is named by at least 2 of the first 10 buyer interviews in insurance/BFSI as a vendor they use or evaluated.

### Needs a trial account to learn

- Gupshup Voice AI (100 free minutes): itemised invoice for 'from INR 3.50' (telephony, LLM, TTS inclusion); Knowlarity number provisioning time and DLT/140/160 steps; Hindi/Hinglish battery to our Plivo number (reply gap, cut-ins, language hold); AI disclosure; test of the 'mhm vs cut-in' claim; depth of campaign, CSV import and analytics surfaces.
- Ringg: current self-serve monthly minimum; the sign-up flow behind its phone-gated demo; Parrot STT on 'haan/hmm/ok'; INR 6 invoice breakdown; Exotel/Vobiz BYOT setup time.
- Smallest Atoms (USD 10 credits): Hindi persona disclosure behaviour; Lightning v3.1 Pro code-switching on 8 kHz PSTN; Indian number options (Plivo/Alohaa); real all-in per-minute for a Hindi agent.
- Ultravox, Cartesia Managed Agents, Deepgram Voice Agent API, PolyAI Dialog-RSN-1 API: each wired to our Plivo number as a brain or substrate, with latency and Hindi turn behaviour measured on the l4b battery.
- Caller.digital: whether a real invoice matches its published per-minute stack, and what 'pay per outcome' means contractually.
- No trial possible (cover via the 10-15 buyer interviews and public material): Gnani, Desible.ai, Navana, Tata Communications+TTBS, Samora. Ask what each buyer uses, what they pay, and what failed.

### Run facts

- Claims: 59 {"observed": 35, "vendor-claimed": 12, "inferred": 10, "unknown": 2}
- REA used: True
- REA notes: REA (npx rea-agents@latest, version 6.7.0) ran. doctor reported no reverse-engineering engines configured (Ghidra/IDA/jadx/Hopper) and missing skill registration; that did not matter for web work. I used inspect-web-network-capture on a real Playwright 1.56 HAR (Ozonetel homepage, 262 entries).
- First run: refused the whole capture with invalid_request, because one Facebook-pixel URL contained an unescaped '[' that fails strict 'uri' format validation (entry 178).
- Workaround: I percent-encoded 4 URLs in a copy (code/har_sanitize.py). The second run succeeded in about 3 s and produced a 1.3 MB lossless evidence record (sha256, redaction, limitations) but no provider or stack classification.
- Takeaway: for radar-style stack identification, REA adds provenance, not inference. Stack signals in this lane come from our own host classification of the Playwright captures (code/analyze.py).
- I did not retry analyze-web-bundle: the Bolna and regulation lanes already recorded it timing out or running out of heap in this sandbox.
- Real-world HARs routinely contain unescaped brackets in tracking-pixel URLs, so any REA HAR step needs a sanitizer first. This is logged as rejected.2026-10-20.radar-rea-har-inspect in the inbox.
