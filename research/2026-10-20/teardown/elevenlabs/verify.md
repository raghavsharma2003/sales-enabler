# ElevenLabs lane: adversarial verification (2026-10-20)

**Scope.** I re-checked every claim graded observed or inferred in four dimensions: architecture (EL-16 to EL-28), pricing
(EL-29, 31, 32, 33), India plumbing (EL-38 to 41, 43, 44) and v2 (EL-51 to 54). That is 27 claims. I also spot-checked
10 claims in other dimensions that those ones lean on: EL-06/07/08 (hidden routes), 09, 11, 13, 14, 15, 37 and 45.
Total: 37 of 56. The other 19 (surface, api, failures, method, velocity, not listed above) were not re-checked.

**Method.** For each claim I:
- re-opened the cited file under `data/teardown/elevenlabs/`;
- re-ran each computation;
- where a re-capture was cheap, made it again into a new directory, `data/teardown/elevenlabs/verify-2026-10-20/`
  (listed in `manifest.csv`).

**Boundaries.** I made public GETs only:
- 28 Google DoH lookups, some with EDNS client subnets;
- 3 GETs to LiveKit hosts: two to `/` and one to `/rtc/validate` without a token;
- 2 Hugging Face model-API reads;
- 1 re-fetch of `docs/llms-full.txt`.

I did not sign up, fetch a WebRTC token, start a demo session or bypass anything.

**Missing file.** The lane wrote no `report.md`. Its task list marks "write report.md" as done, but the file did not
exist when verification started. The verifier's attempt to create it, holding a stub plus the Verification section, was
blocked by the harness ("Subagents should return findings as text, not write report files"). This file is therefore the
Verification section of record. The main loop should paste it into `report.md` when the lane report is written.

## Result

| outcome | n | claims |
|---|---|---|
| Confirmed as written | 18 | EL-09, 11, 13, 14, 15, 16, 17, 19, 24, 27, 28, 29, 37, 38, 43, 44, 45, 53 |
| Confirmed, strengthened, scoped or made falsifiable | 5 | EL-20 (no geo-DNS), 07 (horizon added), 31 (caveats), 32 (range), 40 (scope) |
| Corrected wording or numbers, grade kept | 9 | EL-06, 08 and 22 (counts); 18 (narrowed); 25, 39, 41, 51 and 52 (wording) |
| Corrected, part of the claim refuted | 1 | EL-23: the RAG embeddings are open-weight intfloat E5 (MIT), not ElevenLabs' own |
| Corrected, evidence withdrawn | 1 | EL-54: the demo page forces `language: "en"`, so the English replies are not evidence |
| Corrected, part upgraded | 1 | EL-26: fingerprint use is now observed (visitorId becomes `user_id`) |
| Downgraded inferred → unknown | 2 | EL-21 (Iowa media anchoring and the latency penalty), EL-33 (82-97% margin) |
| Refuted whole | 0 | |

Grades in `claims.json`: before, 44 observed, 9 inferred, 3 vendor-claimed. After, 44 observed, 7 inferred,
3 vendor-claimed, 2 unknown. Every touched claim carries a `verify` block with the status and the reason. Where the
text changed, the block also keeps `original_claim` and `original_grade`.

## Changes, claim by claim

**EL-21 (architecture/india), inferred → unknown.**
- The evidence shows only one thing: the inbound SIP signalling address for standard workspaces (`sip.rtc.elevenlabs.io`)
  is one GCP us-central1 IP.
- The same SIP doc says ElevenLabs "serves SIP traffic from multiple SIP servers", that "SIP requests may come from
  different IP addresses due to our distributed infrastructure" (lines 268-271) and that "RTP uses dynamic IP
  addresses" (line 310). So where media is anchored is not observed.
- The region of the agent runtime is not visible either: the API and LiveKit hosts are global anycast.
- Vendor statements point the same way as the hypothesis, but they are claims, not observations:
  - customer data is US-hosted by default (`overview__administration__data-residency.md` line 12);
  - "Hosted by ElevenLabs" LLMs run in the US unless the enterprise region says otherwise
    (`eleven-agents__customization__llm.md` line 208);
  - residency "may potentially reduce latency" (data-residency line 148).
- The TRAI point rests on Vapi's and Plivo's statements, so it is vendor-claimed.
- Rewritten as a hypothesis for EL-P08 to settle.

**EL-33 (pricing), inferred → unknown.**
- Every COGS component is an analogue: other vendors' ASR and TTS models on rented GPUs (g4), plus LiveKit Cloud's
  retail price as an upper bound.
- The model leaves out:
  - utilisation headroom for burst at 3x concurrency;
  - free-tier minutes;
  - the backup-LLM cascade, which is on by default;
  - the turn model, RAG and egress.
- The corpus holds no ElevenLabs cost or margin data. `company-financials.csv` has funding and ARR only.
- "Could price near Sarvam and stay profitable" cannot be falsified from public data.
- The band is kept as a hypothesis.

**EL-23 (architecture), sub-claim refuted.**
- `e5_mistral_7b_instruct` and `multilingual_e5_large_instruct` are intfloat models on Hugging Face under MIT, created
  2023-12-20 and 2024-02-08 (`verify-2026-10-20/hf/*.json`).
- So "own RAG embeddings" and "only the LLM is third-party by default" are wrong.
- The ASR, TTS and turn-model enums are confirmed as first-party.

**EL-06 and EL-08 (surface; they underpin v2 and the risk node), counts corrected.**
- `code/bundle_endpoints.py` keys endpoints by both (method, path) and ("?", path). Any path matched by both regexes is
  counted twice.
- Re-counted by unique normalised path (`code/verify_bundle_check.py`):

  | count | lane | re-count |
  |---|---|---|
  | outbound-campaigns routes | 23 | 16 paths (18 method-level operations) |
  | in-scope convai routes in the bundle | 568 | 335 unique paths |
  | unpublished convai routes | 326 | 204 unique paths (243 operations) |

- The substance stands. Two additions:
  - the dashboard route table has a `conversationalAiOutboundCampaigns: ${a}/outbound-campaigns` page;
  - `useSuppressLead` is a DELETE on a lead.

**EL-18 (architecture), narrowed.**
- Strengthened on LiveKit-on-GCP:
  - `GET https://livekit.rtc.elevenlabs.io/` returns `OK`, and so does the in-residency host;
  - `/rtc/validate` returns 401 `no permissions to access the room`, a livekit-server response;
  - all three responses carry `via: 1.1 google`;
  - `rtc.elevenlabs.io` is its own Google Cloud DNS zone with no CNAME (`verify-2026-10-20/http/`, `dns/`).
- Removed: "orchestration is its own, rather than Pipecat or Vocode". Nothing observed separates an in-house
  orchestrator from the LiveKit Agents framework. What is observed is that the orchestration does not depend on the
  transport: the same agents are reached over plain WebSocket by the SDK, Exotel and Twilio.

**EL-20 (architecture), strengthened.**
- Re-resolved through Google DoH with client subnets for Jio, Airtel, Azure Central India, US and EU. Every answer was
  identical, with ECS scope /0, so there is no geo-DNS.
- The lane had used Cloudflare DoH, which sends no client subnet. That left open whether Indian resolvers would get a
  Mumbai answer. They do not.

**EL-22 (architecture), counts corrected.**
- The signal file shows rx 112 (94 audio) and tx 279, not 113 (95) and 282.
- Only 3 of 16 `ping_ms` values were captured. They include the agent-proxy hop: l4b measured 76-430 ms through the
  proxy. So they do not measure distance to the backend.
- The page sent `conversation_config_override {first_message, language: "en"}`.
- The HAR holds no WebSocket frames.

**EL-26 (architecture), part upgraded to observed.**
- In widget-core `dist/index.js`, function `za()` reads localStorage `elevenlabs_convai_user_id`. If it is absent, the
  function uses the FingerprintJS `visitorId`, or a random UUID if FingerprintJS fails, and stores it.
- That value becomes the conversation `userId` when the embedder passes none (line 3545).
- v2 relevance: on widget traffic, any per-user memory would be keyed to a browser fingerprint.

**EL-41 (india), corrected.**
- The web widget has a built-in, configurable terms/consent dialog: `terms_text`, `terms_html` and `terms_key`;
  `shareable_page_show_terms` defaults to true.
- For phone calls, the platform injects nothing.

**EL-54 (v2), demo evidence withdrawn.**
- The demo page itself forces `language: "en"`, and l4b line 39 already flagged the English replies as a likely
  configuration artefact.
- What remains is the India page against the docs: zero "Hinglish" in 258 page bodies and 804 titles.

**Wording fixes:**
- **EL-25:** Sentry is on the marketing site; on the app sign-in page the only Sentry string is hCaptcha's own. Identity
  Toolkit backs both Firebase Auth and Identity Platform, and the capture cannot tell which.
- **EL-39:** "limited support for migrating", not "no migration"; the residency latency claim is added as
  vendor-claimed.
- **EL-51:** the versioning doc lists "user memories" under agent `privacy` settings. That is one public mention, while
  the public `PrivacyConfig` schema has no memory field.
- **EL-52:** initiation webhooks serve all inbound telephony and messaging, not only Twilio.

**Caveats added:**
- **EL-31:** three weak inputs:
  - the LLM band uses flash-lite rows, but the default is gemini-2.5-flash;
  - Exotel's rate is quote-gated, so it was assumed equal to Plivo's;
  - the Plivo route may be closed on a standard US-SIP workspace, because Indian numbers need media anchored in India
    (l2 line 188).

  The ratio to Sarvam is 2.1-2.6x. The headline survives because INR 7.60 alone is above the INR 3.5-7 band.
- **EL-32:** the ratio is 3.3-3.9x. 3.3x is at the vendor's own 1K-characters-per-minute convention, on g4's
  440-chars basis.
- **EL-40:** the lane's `llms-full.txt` is a redirect to `llms.txt` (re-fetched today; still a redirect). Page bodies
  were checked for 258 of 804 pages; the other 546 (API reference, help center) were checked by title only.
- **EL-07:** "likely to expire" now has a scoring horizon: public OpenAPI or docs list outbound-campaigns by
  2027-01-31.

## Findings new from verification

1. There is no geo-DNS on SIP, API or LiveKit hosts. An Indian buyer on a standard workspace is always handed the
   us-central1 SIP signalling address (ECS scope /0 for Indian subnets).
2. LiveKit server sits behind GCP HTTPS load balancers on ElevenLabs' own domains, for the default and India-residency
   environments alike.
3. The widget turns a browser fingerprint into the default end-user id.
4. The public demo forces English through a client override. Any language measurement on that demo, l4b's included,
   tests the page's configuration, not the platform.
5. `bundle_endpoints.py` double-counts. Any other lane that reused it reports inflated "unpublished route" counts and
   should dedupe by normalised path. The asset node now says so.
6. The docs do say something about region:
   - "Hosted by ElevenLabs" models (Qwen, GLM, DeepSeek, Nemotron) run in the US unless the enterprise region says
     otherwise;
   - customer data is US-stored by default.
7. None of the 25 status incidents in 75 days involved India residency. Five were EU residency.

## Predictions: falsifiability check (`predictions.json`, left unedited because it is pre-registered)

| id | falsifiable? | issue |
|---|---|---|
| EL-P01 | yes | Fine. Record which route was used. |
| EL-P02 | weakly | On a default English agent, English replies are close to tautological, since the agent is configured for English. "English reply to a Hinglish turn" also needs a coding rule, e.g. less than 20% Hindi tokens by machine language ID plus a manual read. The decision-relevant companion is to configure `hi`, a Hindi voice and language detection, then measure language hold (>= 90%?). Pre-register that before the run. |
| EL-P03 | yes, once "mishandled" is defined per category | The prediction itself says Hindi names pass, so the real claim is 4 of 5. Define the pass condition for each category before the run, e.g. what "opt-out handled" means when the platform has no opt-out field. |
| EL-P04 | yes | The probability (<= 30% that the campaigns UI is visible) can only be Brier-scored, not called hit or miss. |
| EL-P05 | yes, low power | n = 3 announcements. The AMD sentence restates the schema ("Ignored for non-Twilio providers") and is already observed. |
| EL-P06 | yes | Needs a DND-registered number of our own, and a CLI or DLT rejection we can trigger legitimately. Otherwise score the carrier half as not-testable. |
| EL-P07 | yes | |
| EL-P08 | first clause yes; residency clause not testable | India residency is Enterprise-only, so the "falls by >= 0.25 s" clause will be not-testable unless we get an Enterprise trial. The basis also needs a correction: on the Exotel route media goes over WebSocket to the global anycast API host, not to the us-central1 SIP IP. Score the Exotel and SIP routes separately. |
| EL-P09 | yes | |
| EL-P10 | yes, low information | Mostly restates the pricing page and the schema (`cost_fiat` is already observed). The 5% silence rate is not in `hit_if`. Add it: bill a call with a scripted 60 s silence. |
| EL-P11 | yes | Define "mishandled" first: treated as a turn, a re-engage prompt, or the agent stops. |
| EL-P12 | yes | Also log whether the widget-path `user_id` is the fingerprint (EL-26) when testing memory. |

## Changes to `context/inbox/teardown-elevenlabs.json`

- `evidence...elevenlabs-india-residency-sip-region`: the Iowa media-anchoring inference was removed and replaced with
  the observed, vendor-claimed and unknown split. The ECS re-check was added.
- `evidence...elevenlabs-hidden-campaigns` and the asset node: counts corrected (16 paths / 18 operations; 204 of 335
  unique paths). The asset value now names the double-count and its fix.
- `asset.2026-10-20.bundle-vs-openapi-diff` was renamed `asset.2026-10-20.elevenlabs-bundle-vs-openapi-diff` to meet
  the `<kind>.2026-10-20.<lane>-<slug>` rule. Its edge was updated.
- `measure...elevenlabs-india-all-in-price`, `decision...elevenlabs-strongest-india-rival` and
  `risk...elevenlabs-campaigns-and-price`: "82-97% margin (inferred)" is restated as an unverified analogue estimate.
  Price caveats were added.
- `evidence...elevenlabs-v2-memory-loop`: "undocumented" became "one public mention"; the fingerprint `user_id` was
  added.
- `evidence...elevenlabs-claims`: grade counts updated.
- Added `evidence.2026-10-20.elevenlabs-verification` (path: this file) and one event.
- No node was refuted outright, so none was removed.

## Not verified

- Velocity counts (EL-35, 36), apart from the incident titles behind EL-37.
- Complaints (EL-46 to 50).
- EL-01 to 05, EL-10, EL-12, EL-30 and EL-34 (vendor-claimed), and EL-42 (vendor-claimed).
- India-vantage latency of any kind, which needs the India lab VM or the account phase.
- Whether Exotel and Twilio WebSocket media for standard workspaces is processed in the US.
- The bodies of the 546 docs pages that were not saved.
