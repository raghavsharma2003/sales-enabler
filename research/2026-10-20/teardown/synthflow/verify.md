# Synthflow lane: adversarial verification

Verifier pass, 2026-10-20. Inputs:
- `research/2026-10-20/teardown/synthflow/claims.json` (55 claims);
- `predictions.json` (13);
- `pricing.json` and `code/pricing.py`;
- `ip-regions.csv` and `manifest.csv` (486 rows);
- `context/inbox/teardown-synthflow.json`;
- the raw artifacts under `data/teardown/synthflow/`.

The lane's `report.md` did not exist on disk; the verifier created it (a findings index generated from the verified
claims, a reading of the three decisions, the account-phase needs, and the Verification section).

## Method

When the evidence does not carry the grade, the default was to downgrade. For each claim in scope (architecture,
pricing, India plumbing, v2), and for each surface, velocity or failure-mode claim that an inbox node relies on, the
cited file or URL was re-opened and the claim was re-derived from it, not from the lane's wording. Cheap captures were
re-run; new raw files are in `data/teardown/synthflow/verify/` and listed in `manifest.csv`.

| re-check | how | n | result |
|---|---|---|---|
| IP-to-region | fresh `docs.synthflow.ai/ip-allow-lists.md` and Google `cloud.json` (creationTime 2026-10-20T07:07:11, same version as the lane's); own mapping script | 70 unique IPs | 50 us-east1, 17 europe-west3, 2 northamerica-south1, 1 non-GCP (RDAP: MSFT 4.128.0.0-4.143.255.255). Identical IP set to the lane's copy |
| DNS | Cloudflare DoH, 19:46Z; Google DoH for the WebRTC and widget names | 22 hosts | Same answers as the lane for api, api.us, api.eu, app, fine-tuner.ai and sip.*. **webrtc-us / webrtc-eu.synthflow.ai: NXDOMAIN on both resolvers.** mcp.us and mcp.eu share the api.us and api.eu IPs; mcp, docs, widget and webrtc.synthflow.ai share 35.211.74.2 (GCP us-east1) |
| Flipt snapshot | `GET flipt.synthflow.ai/internal/v1/evaluation/snapshot/namespace/default`, no cookie, no auth header | 1 fetch, 60 flags | HTTP 200, 77,914 B, same keys. call_quality_analytics, voice-ux-evaluation and predicted-csat: disabled, 0 rollouts, 0 rules. aurora_model_router: enabled, no rollouts. Rollout segments with workspace constraints are exposed |
| App bundles | grep/regex over the saved index and condensed-ui bundles | 2 bundles (+ chunks) | Janus error string, janode and audiobridge-plugin chunks, `iceTransportPolicy:"relay"`, janus_pod_name, listen-in provider, STT/TTS/LLM enums and end-reason map all re-found. 0 LiveKit client, daily-js, Pipecat or Vocode strings |
| Widget | regex over the saved Conductor widget and runtime config | 2 files | `inputRate = 24e3`, 20 ms frames, PCM16, WebSocket only, Turnstile key, work-email and six-digit-code strings, maxCallSeconds 240, S2S agent table |
| OpenAPI | re-parsed | 69 paths / 110 ops | Enums for STT provider, LLM, language, call status (14) and end reasons (10) as stated; 0 consent-ledger, DNC, blocklist, opt-out or DND fields |
| Docs corpus | word-bounded, case-insensitive grep | 370 .md pages | India/TRAI/DLT/NCPR/NDNC/DND/140/DPDP/DNC/+91: 0. "160"/"1600" only in a HIPAA citation, an IP address and a street address |
| Pricing page | live re-fetch synthflow.ai/pricing, 19:51Z | 1 | "Enterprise contracts start at $30,000 annually"; no per-minute price |
| Pricing maths | recomputed pricing.json from its inputs, plus the H1-2026 "typical" line in pricing-history.json | 7 inputs | Lane arithmetic exact; range and floor handling corrected (SYN-41/42) |
| Source map | GET index-boN6ncNO.js.map | 1 | HTTP 200 text/html, 3,351 B (SPA shell) |
| Packages | npm registry search; PyPI JSON | 2 | Only @synthflow-ai/n8n-nodes-synthflow is first-party; PyPI "synthflow" is unrelated |
| GitHub | api.github.com org listing (refused by the session proxy), then WebFetch of github.com/SynthFlowAI | 1 | 6 public repos; freeswitch-src (fork, updated 2026-09-29), voiceblender (fork, Go, 2026-08-16) |
| Deepgram list | WebFetch developers.deepgram.com/docs/models-languages-overview | 1 | Nova-3 multi list matches Synthflow's word for word; **Flux general-multi has the same ten** |
| Status feed | re-parsed the saved RSS | 11 items | 3 incidents + 8 maintenance; 2026-08-07 window 08:20-11:10 UTC; LLM judge and post-call SMS did not run |
| Changelog | recount from changelog.csv and the 106 saved pages | 106 | 67 in the window; 2026-08 = 8; 2025-02..07 = 0 |
| Trustpilot | recount of the extract; inspection of the saved HTML | 22 rows | Counts match; the saved HTML files are AWS WAF interstitials; 11 of 11 prior hand-coded dates reappear |
| Manifest | size and sha256 of every row; unlisted files | 486 rows | 0 mismatches, 0 unlisted lane files |

Not re-run:
- REA (300 s per attempt; the lane's status file was re-read).
- Any logged-in view.
- The homepage demo call (email code and Turnstile, out of bounds).
- security.synthflow.ai (Cloudflare challenge).
- G2, Capterra and Reddit.

## Result: 30 confirmed, 18 corrected, 2 downgraded, 0 refuted outright, 5 not re-checked, 2 split, 2 added

No claim was wrong in its core. Seven carried a factual error in part, fixed in place: SYN-24 (deprecation date and
host), SYN-29 (voice count at launch), SYN-41 (range, "on top", ratio), SYN-50 (monthly range), SYN-60 (page count),
SYN-70 (code list) and SYN-71 (403/484 labels). Four carried a conclusion the evidence does not reach: SYN-25, SYN-26,
SYN-28 and SYN-61.

### Downgraded

- **SYN-22** (observed -> inferred). The ports, the job post and the forks are observed; "telephony is self-run / own
  SBCs" is an inference from them. The job post asks for hands-on Kamailio and RTPEngine and working knowledge of
  FreeSWITCH, and lists "GCP, Kubernetes, Python or Go" only as nice to have, so "on GCP and Kubernetes" overstated it.
- **SYN-53** (inferred -> unknown). The only link between the 2026-08-07 incident and the 2026-08-25 model restriction
  is topic and an 18-day gap. The incident was a backend restriction on which models the platform could call, which
  broke post-call processing. The cited flag llm_selection_restriction (ENG-6621) is described as a frontend change.

### Corrected, architecture

- **SYN-20** (observed). "Every IP maps to GCP" contradicted its own exception: 69 of 70 do. Added an observation the
  lane missed: the legacy Global cluster, which stores data in the EU, has all of its SIP signalling, media and egress
  addresses in us-east1, so calls on it are processed in the US.
- **SYN-21** (observed; split). Cluster facts confirmed. The LATAM case (RTT 191.3 -> 99.5 ms, "available for other
  regions") is a vendor case study, now SYN-21b (vendor-claimed).
- **SYN-24** (observed).
  - (1) The 2026-05-27 changelog entry says the old endpoint (widget.synthflow.ai/websocket/token/{assistant_id})
    "was deprecated on June 15, 2026".
  - (2) `wss://webrtc-us.synthflow.ai/ws-audio` is only the docs' example value of `wsMediaBaseUrl`, returned by
    `GET /v2/calls/outbound-test-ws-media/base-url`. The hostname does not resolve publicly (NXDOMAIN, Cloudflare and
    Google, 19:46-19:50Z), and neither does webrtc-eu. The live media host is issued per session.
  - (3) Frames are RTP packets or raw codec payloads (opus, PCMA, PCMU), not raw PCM.
- **SYN-25** (inferred). The livekit-egress@synthflow-dev signed URL, with a 1722531305903 ms prefix (2024-08-01) in the
  storage-synthflow-develop bucket, is confirmed, and no LiveKit strings appear in the 2026 bundles. That rules out
  LiveKit only on the browser path; server-side orchestration is invisible to client bundles.
- **SYN-26** (inferred). Python is well supported by Python exception text and Python-repr quoting in aiohttp-style
  errors (orchestrator-dev and orchestrator-testing /outbound). "In-house" is not: Pipecat is a Python framework built
  on aiohttp.
- **SYN-28** (inferred). Deepgram's Nova-3 multi list matches Synthflow's Multilingual list word for word and in order,
  but Deepgram lists the same ten languages for Flux general-multi. voice-configuration.md also tells Multilingual
  agents on Synthflow TTS to set STT Provider to Synthflow STT. "Deepgram multilingual set" holds; "Nova-3" does not.
- **SYN-29** (observed). The 2026-05-13 changelog says Synthflow TTS launched "across 32 languages with 12 built-in
  voices"; "200 voices" is the current docs page. The eight ElevenLabs models, Aura-2 and the default model choice are
  confirmed.
- **SYN-31** (observed; split). Client-code facts confirmed. The conclusion "the marketing demo is not the product's
  cascade" is an inference from client config, since no call was placed; it is now SYN-31b.

### Corrected, pricing

- **SYN-41** (inferred). Three faults, all in the reasoning rather than the arithmetic (which is exact).
  - (1) The upper bound ignored Synthflow's own H1-2026 page line "PAYG typically $0.15-0.24/min" (Common Crawl
    2026-03-14 and 2026-06-16, l4a pricing-history.json). Removing its $0.02 managed US Twilio leg and adding Twilio
    India $0.0496 gives $0.180-0.270 (INR 17.1-25.6). The estimate is therefore **INR 15.2-25.6**, not 15.2-18.0.
  - (2) The claim said the $30k floor is "added on top", but pricing.py computes max(floor per minute, usage rate),
    which treats it as a usage commitment. Synthflow does not say which it is, so both readings are now given: as a
    commitment, INR 47.5 and 23.75 per minute at 5k and 10k min/month, not binding above about 9-16k; as a fee on top,
    add INR 47.5, 23.75 and 9.5 per minute at 5k, 10k and 25k.
  - (3) "3-5x Indian list prices (INR 3-6)" becomes about 2-7x against the brief's INR 3.5-7.
- **SYN-42** (inferred). The sum and margin reproduce. The own-infrastructure line ($0.002-0.006) has no source and is
  now labelled a placeholder. The component prices are Vapi's published pass-through rates, not Synthflow's costs.
  Since 2026-08-25 non-enterprise agents do not run on OpenAI, so that line is no longer their cost base.

### Corrected, India plumbing

- **SYN-60** (observed). 370 pages, not 371. The grep is now spelled out and the false hits are explained.
- **SYN-61** (inferred). The premises hold, but "would need a custom PoP" is too strong.
  - The Exotel lane observed AgentStream streaming India-anchored calls over WebSocket to third-party bots (EXO-13), and
    Exotel publishes integration guides for foreign voice platforms (EXO-28, vendor-claimed). A buyer-built bridge from
    such a stream into Synthflow's WebSocket media API (SYN-24) is therefore a second route.
  - Synthflow's custom-number providers (twilio, telnyx, vonage, ring_central, ringcx, custom, zoom, five9, 8x8) include
    no Indian carrier.
  - Whether either route is lawful for 140/1600-series calling was not established.
- **SYN-65** (observed). The API language enum's only English code is en-US, although the docs offer three accents.
  "Biased toward English" is stated for Synthflow TTS on Multilingual agents.

### Corrected, v2, velocity and failure modes

- **SYN-81** (observed). The quotes are confirmed and the docs show no A/B testing or fine-tuning. "Feed back into the
  next version" fits the manual loop the docs do describe (analytics plus Aurora prompt review), so it overstates
  rather than contradicts.
- **SYN-50** (observed). 8-12 entries a month since 2026-03, not 10-12; 1-4 in 2025, not 1-5. February to July 2025
  have zero entries, which suggests an incomplete early record, so the speed-up is overstated.
- **SYN-70** (observed). INTEGRATION and SALES_DELIVERY (1 each) were missing from the list. The four saved Trustpilot
  HTML files are AWS WAF "Verifying Connection" pages, so the review text is WebFetch extractor output. It is
  corroborated: all 11 dates hand-coded on 2026-10-17 reappear.
- **SYN-71** (observed). "403 : Forbidden" maps to "Forbidden" and "484 : Address Incomplete" to "Address Incomplete".
  Only the Python exceptions, the orchestrator-URL errors and the literal "error" fold into "System Error".
- **SYN-03** (observed). "Self-serve is effectively closed" is now marked as inference. BYOK includes Azure OpenAI
  (azure.md), which contradicts general-configuration.md.

### Added by the verifier

- **SYN-21b** (vendor-claimed): the LATAM PoP case study (above).
- **SYN-31b** (inferred): the homepage demo probably runs on speech-to-speech models (above).
- **SYN-37** (observed). The published subprocessor list (GCP, OpenAI, Deepgram, ElevenLabs, Bubble.io, Twilio) omits
  Anthropic: aurora_model_router is on for all workspaces and routes "between Claude Sonnet and Haiku". It also omits
  Soniox: soniox-stt-rt-v3 is in the STT enum, and a flag enables a "custom soniox voice" for one customer. Whether
  Aurora calls Anthropic directly or through a cloud reseller is not observed.
- **SYN-66** (inferred). Opt-out handling can fail silently. no_opt_out is a post-call LLM-judge field (SYN-07). On
  2026-08-07, 08:20-11:10 UTC, that judge, the extractors and post-call SMS did not run, while the webhook was delivered
  with those fields empty. A buyer suppressing from no_opt_out would have lost every opt-out in that window with no
  error.

## The findings that most change the lane's conclusions

1. **The Indian minute is dearer and less certain than stated.** INR 15.2-25.6, not 15.2-18.0, and the $30k floor's
   treatment (commitment or fee) is unpublished. This moves the inbox measurement node to `source: model`.
2. **India has a second route.** Synthflow cannot present an Indian CLI natively. Besides a custom PoP, a buyer can
   bridge an Indian CPaaS stream into Synthflow's WebSocket media API. That costs the buyer real engineering, which is
   the friction VP removes, but it means "impossible without a PoP" overstated Synthflow's exclusion.
3. **Architecture claims were narrowed to what the client shows.**
   - Own SBCs: inferred.
   - Orchestrator: Python, but in-house or framework is unknown.
   - Multilingual STT: a Deepgram multi set, model not determined.
   - LiveKit: absent from the browser path only.
   - The published WebSocket host does not resolve.
4. **Opt-out is not just post-hoc; it has already failed silently once** (SYN-66). This is the sharpest measurable
   place for VP to be better: enforce suppression at dial time.
5. **The subprocessor list is incomplete** (SYN-37): it matters for DPDP due diligence by an Indian buyer.

## Predictions: falsifiability

| id | falsifiable | note |
|---|---|---|
| SYN-P01 | yes | Score the >24 h timestamp; record every gate. |
| SYN-P02 | yes (compound) | Score as P02a (a purchased US number cannot reach the Indian handset) and P02b (BYO Twilio takes >=30 min and hits a Twilio-side error). |
| SYN-P03 | yes | The silent-ignore part is already documented; build time and the language picker are the informative parts. |
| SYN-P04 | **no as written** | "Fails or turns awkward" cannot fail. Score four sub-items: no portal CSV upload; id-less duplicates dialled twice; bad numbers accepted then failed at dial time; opt-out row dialled (our own synthetic numbers only). Hindi names pass through. |
| SYN-P05 | partly | "Setting both gates fails at least one recipient" contradicts batch-calling.md for overlapping windows. Score only the non-overlapping configuration (all fail with "Call cannot be initiated outside the configured working hours"); expect 0 failures when the window sits inside the agent's hours. |
| SYN-P06 | yes | Needs our own switched-off, caller-tune and voicemail SIMs as ground truth. |
| SYN-P07 | yes | |
| SYN-P08 | yes | |
| SYN-P09 | yes, except the last clause | The call-quality card flag has no rollouts (SYN-13), so the card comparison is probably unscorable; score the handset p50/p95 only. |
| SYN-P10 | yes | Record which STT/TTS ran (SYN-28). |
| SYN-P11 | yes | |
| SYN-P12 | yes | Bounded negative over every settings and campaign screen. |
| SYN-P13 | conditional | Only if the owner authorises a sales conversation; otherwise record it as unscored. |

## Residual risks the verifier could not close

- DNS was resolved from one US sandbox; GeoDNS answers from India were not tested. NXDOMAIN for webrtc-us/eu could be
  a split-horizon or per-session name; the conclusion is only that the documented example is not a public host.
- The GitHub and Deepgram re-checks went through WebFetch, whose output is an extractor's summary. The quotes are saved
  as text records, not raw pages, because the GitHub API was refused by the session proxy.
- The Trustpilot text is extractor output (the raw pages are WAF interstitials); counts are only as good as that
  extraction, although 11 of 11 earlier rows reappear.
- SYN-37 rests on flag text and an enum value. It shows the code path exists and that the Aurora router is enabled,
  not observed traffic to Anthropic or Soniox.
- SYN-66 shows one past window. How often the post-call judge fails, and whether a retry exists, is unknown.
- Whether a buyer-built Indian CPaaS bridge into Synthflow is lawful for a 140/1600-series deployment needs the
  regulation lane, not this one.

## Files changed

- `research/2026-10-20/teardown/synthflow/claims.json`:
  - grades and claim text edited in place;
  - every re-checked claim has a `verification` object (result, grade before and after, note, evidence, date);
  - replaced text kept as `claim_before_verification`;
  - SYN-21b, SYN-31b, SYN-37 and SYN-66 added (59 claims).
- `research/2026-10-20/teardown/synthflow/report.md`: created (did not exist), with the Verification section.
- `research/2026-10-20/teardown/synthflow/predictions.json`: `falsifiable` and `verifier_note` on all 13; prediction
  text unchanged.
- `research/2026-10-20/teardown/synthflow/manifest.csv`: 13 rows added for the verifier's saved re-checks (499 rows,
  0 sha256 mismatches, 0 unlisted files).
- `research/2026-10-20/teardown/synthflow/pricing.json`: a `verifier_2026_10_20` block appended (corrected range, floor
  treatment, ratio, COGS caveats); the lane's computed figures are left as they were.
- `research/2026-10-20/teardown/synthflow/parity-delta.csv`: value and note corrected on 4 rows (code_switching,
  auto_optimisation_learning, analytics, public_demo).
- `context/inbox/teardown-synthflow.json`:
  - 11 nodes corrected (no node refuted, none removed);
  - the price node set to `source: model`, `status: proposed`;
  - 1 node, 2 edges and 1 event added;
  - validated with `scripts/lib/context-schema.mjs` nodeErrors (0 errors); all edge ends exist.
- New raw artifacts in `data/teardown/synthflow/verify/`:
  - `doh-recheck-2026-10-20.jsonl`, `flipt-snapshot-noauth-recheck.json`, `gcp-cloud-recheck.json`, `goog-recheck.json`;
  - `ip-allow-lists-recheck.md`, `pricing-recheck.html`, `map-recheck.body`, `npm-search-synthflow.json`,
    `pypi-synthflow.json`;
  - `gh-repos-recheck.json` and `gh-org-repos-recheck.html` (proxy refusals);
  - `webfetch-github-org-2026-10-20.txt`, `webfetch-deepgram-models-languages-2026-10-20.txt`.
