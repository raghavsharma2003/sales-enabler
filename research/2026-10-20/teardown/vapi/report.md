The Vapi lane of the account-free phase is finished, apart from report.md: the subagent harness refused that write (the same thing happened in the radar and regulation lanes), so its content is condensed here. The other outputs exist: claims.json (63 graded claims), predictions.json (P01-P10, written before any trial account), pricing.json, bundle-findings.json, manifest.csv (781 raw files with sha256) and context/inbox/teardown-vapi.json (13 nodes, 24 edges, 1 event). I checked the inbox by merging it into a scratch copy of the graph: the repo's check reports "Context valid: 1060 nodes". The real graph.json was not touched, and nothing was committed or pushed.

**What Vapi is.** A developer infrastructure layer.
- It covers assistant config, versioning and traffic splits, tools, squads, Composer (alpha chat builder), GPT-Live (beta), campaigns, logs with 638 ended-reason codes, evals, simulations, monitors, boards and scorecards.
- There is no contact or CRM object. Consent, suppression, retries, calling windows and business outcomes are left to the buyer.

**India: the gap is structural.**
- Vapi's own Plivo guide says Indian numbers cannot be used, because TRAI requires SIP termination on an Indian server, "which Vapi does not currently support".
- Twilio, the only documented route to Indian handsets, allows outbound calls to India only from non-Indian numbers.
- So an Indian enterprise on Vapi gets no 140xx, 1600xx or declared Indian caller ID, and no DLT or A2P path.
- Vapi's regions are US (AWS us-west-2), EU (only on the top Premier tier) and Australia. There is no India region.

**Campaigns.**
- Each campaign has one absolute window: at most 7 days ahead, in 15-minute steps, one time zone. There is no recurring daily window.
- There is no per-contact retry. The only retry is waiting up to 1 hour for a free call line.
- There is no draft, and a campaign is read-only once launched.
- The dashboard's CSV code puts "+" in front of any number. A 10-digit Indian mobile such as 98xxxxxxxx becomes "+98..." (Iran's country code). One empty number rejects the whole file. There is no dedupe and no opt-out column.

**Architecture** (each line graded in claims.json).
- Seen in our own captures: browser calls run on Daily WebRTC, on a mediasoup SFU hosted on Oracle's Kubernetes service in US-Ashburn, with Cloudflare and Twilio relay servers. The call websocket for the demo org runs in AWS us-west-2. Vapi runs its own SIP gateways on AWS. The API is Express behind Cloudflare.
- Claimed by Vapi's engineering blog: its own streaming pipeline rather than Pipecat or LiveKit Agents. That means:
  - a voice-activity detector in a separate process;
  - an end-of-turn model that predicts and cancels LLM calls;
  - routing across 40+ Azure OpenAI deployments.
  The same blog says Neon is the primary database with an AWS Aurora fallback, on multi-cluster Kubernetes.

**Price.** On list prices, an Indian outbound minute costs INR 12.5-17.0 all-in at FX 95. Of that, INR 9.46 is Vapi's hosting fee plus Twilio's India-mobile rate, before any AI. This confirms ECO-17. I estimate Vapi's margin on the hosting fee at 90-98%; that is an inference, not measured.

**Velocity and reliability.**
- 25 weekly changelog entries with 82 items in the last 6 months. October 2025 to March 2026 was published only as one retroactive summary. Nothing India-specific shipped.
- The status page shows 33 incidents in 6 months, including a full US outage of about 4 h 07 min on 2026-05-21. That sits against Vapi's 99.99% uptime claim. Vapi's own write-up of the outage says scheduled and campaign calls during the outage were not retried automatically.

**Complaints.** Traced to sources for latency, billing (platform fee), reliability, support (no SLA below the Core tier), DTMF/telephony and UI. Trustpilot stands at 2.5/5 on 16 reviews.

**Future-version (v2) notes.** No memory across calls. Improvement is a manual loop. There is an unannounced alpha "Mission Control" with live listening and live call control.

**What this means for the three decisions.**
1. **Pre-sale or post-sale first:** Vapi does not settle this, but it strengthens the case for leading with post-sale (regulation lane RS-59). Recurring windows, per-contact retries and suppression are exactly what Vapi leaves to the buyer, and post-sale due-date reminders need all three.
2. **Parity floor:** Vapi sets the developer-surface floor. Must-be items include a browser test call, publish/versioning, the basic tools, call logs with ended reasons, CSV campaigns, webhooks, export and post-call extraction. A Composer-style chat builder is parity, not a delighter.
3. **Where VP wins:** five runnable tasks.
   - an Indian caller ID with declared A2P;
   - messy-CSV hygiene;
   - recurring windows with retries;
   - reply gap on Indian phone lines;
   - failure reasons in business language, plus holding Hinglish.

Price is not the wedge, which is consistent with rejected.2026-10-17.parity-undercut.

**Blocked, not bypassed:** Reddit, G2, support.vapi.ai (Vercel checkpoint and 429s) and the GitHub API.

---

## Structured result (from the workflow run wf_560edf6c-5d6, public-material phase)

### Key findings

- Vapi cannot terminate Indian numbers. Its Plivo guide says TRAI needs SIP termination on an Indian server, 'which Vapi does not currently support' (Plivo's own Vapi guide says the same). Twilio, the only documented route, allows outbound calls to India only from non-Indian numbers. So there is no 140xx, 1600xx or declared Indian caller ID, and no DLT or A2P path [VAP-42, 43, 44] (observed / inferred).
- Regions are US (AWS us-west-2, the default), EU (eu-central-1, Premier tier only) and Australia (seen on the status page and in Vapi's outage write-up). There is no India region. GPT-5 Azure region pinning is model-level only [VAP-22, 48] (observed).
- Campaign engine: one absolute window per campaign (at most 7 days ahead, one time zone), no recurring daily window and no per-contact retry; the only retry is waiting up to 1 hour for a free call line. No draft, and read-only after launch. Docs: 'The organization running the campaigns owns ... the retry rules'. The dashboard Campaigns UI only shipped on 2026-08-31 [VAP-03, 04, 46, 47] (observed).
- The dashboard CSV parser (public JS) puts '+' in front of any number, so a 10-digit Indian mobile becomes '+98...' (Iran's country code). One empty number rejects the whole upload. There is no dedupe and no opt-out column [VAP-49] (observed, code).
- Browser calls run on Daily WebRTC: a mediasoup SFU on Oracle's Kubernetes service in US-Ashburn, with Cloudflare and Twilio relay servers. The demo call's websocket host is phone-call-websocket.aws-us-west-2-backend-production1.vapi.ai, which resolves to AWS us-west-2. The hostname printed in the docs no longer resolves [VAP-18, 19, 20] (observed, from our demo-call capture).
- Orchestration is Vapi's own streaming pipeline, not Pipecat or LiveKit Agents: a voice-activity state machine in a separate process (about 800 ms of silence to stop), an end-of-turn model that predicts and cancels LLM calls, and latency-routed Azure OpenAI deployments. LiveKit appears only as an English-only end-of-turn model option. The same blog names Neon as primary database with an Aurora fallback, on multi-cluster Kubernetes [VAP-24, 25, 26] (vendor-claimed + inferred).
- List price for an Indian outbound minute is INR 12.5-17.0 at FX 95. Of that, INR 9.46 is the $0.05 hosting fee plus Twilio's India-mobile rate ($0.0496), before any AI. This confirms ECO-17. Estimated hosting margin is 90-98% (inferred). Pricing changes since June 2026: zero data retention is now included in every paid package, and free credits are $5 [VAP-33, 35, 36].
- Data model: there is no contact or CRM object (customers are inline on each call or campaign row). The ended-reason enum has 638 engineering codes. The org record has a 'channel' field with values daily, weekly, intuit and hcs, which looks like release-channel clusters plus dedicated customer clusters (inferred). The dashboard code holds about 142 request paths against 74 in the public API [VAP-02, 12, 13, 15, 16].
- Reliability vs claims: 33 incidents in 6 months. A 4 h 07 min full US outage on 2026-05-21, caused by two databases every call depends on; per Vapi's own write-up, 'scheduled and campaign calls ... were not retried automatically'. That sits against a 99.99% uptime claim. About 2 h of US call failures on 2026-08-19 and 3 SIP incidents in October [VAP-41, 54] (observed).
- Velocity: 25 weekly changelog entries with 82 items in the last 6 months. October 2025 to March 2026 was published only as one retroactive summary, and the SDKs had 4-7 month release gaps over the same winter, then v3.0.0 in October 2026. Nothing India-specific shipped [VAP-38, 39, 40] (observed).
- Future-version (v2) notes: no memory across calls (0 memory pages in the 307-page docs index). Improvement is a manual loop of monitors, issues, evals, simulations and manual traffic splits. Unannounced, flag-gated features in the dashboard code: Mission Control (sentiment cards, live listening, live call control), Call Health, and an 'Improve the assistant' kickoff in Composer [VAP-06, 60, 61, 62] (observed).
- REA: analyze-web-bundle produced nothing in 300 s at about 6 GB of memory. The HAR inspector needed files under 32 MB and gave no stack inference. inspect-web-page worked. The stack facts came from our own HAR, bundle, DNS and RDAP analysis [VAP-32].

### Pre-registered predictions for the account phase

- P01: sign-up to the first browser test call takes 10 min or less, with no card needed (confidence 0.75).
- P02: no ring on our Indian handset without a second vendor account (Twilio, Telnyx or Vonage) and an international (+1) caller ID; at least 45 min even with an existing Twilio account (0.85).
- P03: the standard Hinglish agent builds in 15-35 min, but only after manually choosing a multilingual speech-to-text provider and a Hindi voice, and turning off the English-only end-of-turn model; left on auto-detect, the language misfire seen on 2026-10-17 reproduces (0.7).
- P04: the messy 50-row CSV hits at least 3 of these: an empty number rejects the whole file; 10-digit numbers get a wrong country prefix; duplicates are dialled twice; the opt-out row is dialled; an upper-case 'Number' header fails (0.8).
- P05: a 3-day 10:00-21:00 IST schedule needs 3 separate campaigns, and unanswered contacts are never retried (0.85).
- P06: on Indian mobiles, at least 30% of network announcements ('switched off', 'not reachable', 'busy') are misclassified or the call is held open; transfer to a +91 number works only over the international leg, about INR 4.7/min extra (0.55).
- P07: a failed call and its reason are found within 5 min, but the reason is only an engineering code (0.7).
- P08: CSV or JSON export works, but there is no single campaign-results export that includes structured outputs (0.6).
- P09: on Indian phone lines, the handset-side reply gap is 2.4-3.4 s at the median (point estimate 2.9 s), at least 4.0 s at the 90th percentile, and at least 1.8 s even when tuned (0.65).
- P10: the real invoiced cost (Vapi plus Twilio) is INR 12-18 per Indian minute, with the hosting fee at least 30% of it (0.75).

### Needs a trial account to learn

- Timed screen recordings for P01-P08: minutes and clicks to the first browser call and to the first ring on our Indian handset, plus the KYC and India geo-permission steps on the Twilio account it needs.
- Server-side CSV behaviour: does the API reject the '+98...' and '+0...' numbers the dashboard lets through, which ended reason do they produce, and are duplicates dialled twice.
- The 2026-10-17 caller battery run against our Plivo test number, recorded in stereo, at least 30 clean turns: handset reply gap, cut-ins, collisions, Hinglish language hold with explicit hi-IN or multilingual settings, and AI disclosure.
- Real Vapi and Twilio invoice lines per Indian minute, and the hosting fee's share of the total.
- Whether the flag-gated features (Mission Control, Call Health, knowledge bases v2, the full-duplex harness) are switched on for a new self-serve account; what Composer can actually do, and how its 'Improve the assistant' flow works.
- Campaign edge cases: what happens on the 4 call lines of the free tier with a 50-row list, what happens when the window closes, and whether the export includes per-contact structured outputs.
- Voicemail detection against Indian network announcements (switched off, not reachable, busy), and transfer to a +91 number.
- Which speech-to-text, LLM and voice the default 'Balanced' preset picks, and how its cost and latency estimates compare with what we measure.

### Run facts

- Claims: 63 {"observed": 53, "inferred": 7, "vendor_claimed": 3, "unknown": 0}
- REA used: True
- REA notes: REA (rea-agents 6.7.0, run with npx -y rea-agents@latest) worked partly.
- **inspect-web-network-capture** first refused our raw Playwright HARs: the dashboard capture was 42 MB, over REA's 32 MB input limit. After I stripped third-party response bodies (har_slim.py) and redacted tokens (har_redact.py), it ran, but it only returns normalised records. It gives provenance, not stack inference, which matches what the radar lane found.
- **analyze-web-bundle** on the dashboard registration page (headless Chromium over the DevTools protocol, allowed origin dashboard.vapi.ai, source-map fetching on) ran for more than 5 minutes at about 105% CPU and about 6 GB of memory, and wrote nothing before my 300 s timeout. The Bolna lane got the same empty result.
- **inspect-web-page** worked: 58 scripts, 0 source maps, and storage key names including AUTH_PROVIDER.
- **Fallback:** I did the stack analysis myself with Playwright HAR captures plus a RTCPeerConnection wrapper for one 25 s homepage demo call (demo_signal.mjs). I also did static string analysis of 561 public dashboard JS chunks (bundle_findings.py), DNS lookups, ARIN/RIPE RDAP, and AWS ip-ranges matching. That produced the Daily-on-Oracle, us-west-2 orchestration, routes, feature flags and CSV-parser findings.

**Redaction.** All kept HARs and the signalling JSON have tokens, relay-server credentials and auth headers redacted. The full raw HARs were deleted.

**Blocked and not bypassed:** Reddit JSON (403), G2 (403), support.vapi.ai (Vercel security checkpoint, 429), and the GitHub API and github.com (403, session-scoped). Trustpilot answered curl with 403 but was readable through WebFetch.


## Verification (adversarial verifier, workflow wf_560edf6c-5d6)

- Checked: 49; confirmed: 27; downgraded: 4; refuted: 2
- Hit rate: 45 of the 49 re-checked claims (92%) kept their grade. 27 of 49 (55%) needed no change at all. 17 kept their grade but had text fixed, 4 were downgraded, and 1 was refuted in part (2 counting VAP-05's partial refutation, which is recorded as corrected). By scope: architecture 15 checked (0 downgraded, 7 corrected); pricing 5 (1 downgraded, VAP-36; 2 corrected); India plumbing 9 (1 downgraded, VAP-43; 6 corrected); v2 4 (1 downgraded, VAP-60; VAP-61 refuted in part).

### Refuted

- VAP-61: Sub-claim refuted: 'Nothing applies changes automatically; Composer cannot deploy to production automatically'. That quote is from a stale Limitations list in composer.md. The same page lists an approval mode 'Bypass approvals: Composer applies changes without pausing', and the modes cover publishing (changelog 2026-09-28). Changelog 2026-09-14 says Composer creates and runs simulations. Claim rewritten: the loop is started by a human, and no autonomous trigger was found, but under Bypass Composer can fix, test and publish without pausing. Grade stays observed for the corrected text.
- VAP-05: Sub-claim refuted: 'Composer cannot delete, test'. It is contradicted by composer.md's Deletion section ('Composer can delete resources ... unless you have selected Bypass') and by changelog 2026-09-14 (Simulations in Composer). Text corrected; recorded as corrected, grade stays observed.

### Downgraded

- VAP-36 (inferred -> unknown): The 90-98% hosting margin rests on an assumed vCPU share per call and an assumed vCPU-hour price, and neither was observed. Its supports are a vendor claim (per-call VM), a competitor's claim (HN 60-70%) and a vendor-claimed 'no markup'. One component was checked: Daily audio-only is $0.00099 per participant-minute at entry, and the web call had 3 participants, so about $0.003/min. That fits the estimate but does not establish it.
- VAP-43 (observed -> inferred): Twilio's 'outbound to India only from non-Indian numbers' is observed. 'An Indian enterprise cannot present a 140xx/1600xx/declared CLI' is a conclusion, and as written it contradicted VAP-44's own bridge path (an Indian CPaaS streaming into Vapi's WebSocket transport). Rescoped to Vapi's native telephony.
- VAP-53 (observed -> vendor-claimed): The HN comment '60-70% of our total spend was the Vapi platform fee' (objectID 46189900) is by the founder of Dograh, posted in his own 'Show HN: Dograh - an OSS Vapi alternative' thread. It is an interested competitor's claim, not a customer report.
- VAP-60 (observed -> inferred): 'No memory in the docs' was checked only against the llms.txt titles and descriptions plus 105 of 308 pages. The lane missed chat Sessions (persistent chat context, 24 h default expiry, optional customerId; OpenAPI Session). Rewritten as a bounded negative for voice: CreateCallDTO has no session or previous-call field.

### Notes

I could not write report.md or verify.md: the harness refused both ("Subagents should return findings as text, not write report files"), the same refusal the lane hit. I did not try other filenames. The lane's report.md never existed on disk. The Verification section and the verify.md text are below; the per-claim records are in claims.json. Nothing was committed, pushed or written to graph.json.

FILES CHANGED
- /home/user/sales-enabler/research/2026-10-20/teardown/vapi/claims.json: grades edited in place.
  - 50 claims carry a verification object: {result, grade_before, grade_after, note, evidence, date}. One of them (VAP-52) is marked "not re-checked".
  - 14 claims whose text changed also keep claim_before_verification.
  - Grades now: 50 observed, 8 inferred, 4 vendor-claimed, 1 unknown (was 53 / 7 / 3 / 0).
- /home/user/sales-enabler/context/inbox/teardown-vapi.json: no node removed, because none was wholly refuted. Ten fields corrected:
  - titles of vapi-claims, vapi-no-india-termination, vapi-india-all-in-price, vapi-campaign-engine-limits, vapi-architecture, vapi-v2-loop and vapi-account-phase;
  - decision rationale;
  - rejected.vapi-rea-analyze-web-bundle 'broke';
  - status measurement n.
  - Added event teardown_vapi_verified.
  - Validated with scripts/lib/context-schema.mjs nodeErrors: 0 problems; all 24 edges resolve; all paths exist.
- New raw files in /home/user/sales-enabler/data/teardown/vapi/verify/: doh-recheck-2026-10-20.jsonl, npm-vapi-ai-web-time-2026-10-20.json, daily.co_pricing_video-sdk.html, sourcemap-recheck-2026-10-20.txt.
- /home/user/sales-enabler/research/2026-10-20/teardown/vapi/manifest.csv: 4 rows appended. All 785 rows' sha256 and byte counts re-verified; 0 mismatches, 0 unlisted files.
- Backups of the pre-verify claims.json and inbox, and the two apply scripts, are in /tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/.

METHOD
Default to downgrading. For each observed or inferred claim on architecture, pricing, India plumbing or v2 (plus spot checks elsewhere), I re-opened the cited file and re-derived the claim from it, not from the lane's wording. Cheap re-runs:
- DNS: 6 hostnames x 2 DoH resolvers (Google and Cloudflare), 19:25Z.
- Source maps: two .map URLs (both 404).
- npm registry: @vapi-ai/web release times.
- Daily video-sdk pricing page.
- Counts recomputed:
  - pricing arithmetic;
  - status incidents (33 + 18 = 51 in the window; 114 in the 250-item feed);
  - changelog items (82 / 111);
  - endedReason (638);
  - OpenAPI paths (74) and provider enums.
- Re-grepped in the 561 dashboard files: the CSV normaliser, LiveKit and Pipecat strings, and the ':india' suffix.
- Not re-run: the demo call (the saved HAR and signal JSON were re-analysed instead), and anything behind a login.

CORRECTED (grade kept)
- VAP-02: CreateCallDTO, Call and Session carry customerId ("To call a transient customer, use customer instead"), which implies a stored customer entity the public API cannot create or list. Narrowed to the public API.
- VAP-18: the Daily room had two bot-side participants, not one. One sends the SDK's 'listening' start signal; the other ('Vapi Speaker') publishes audio and transcripts. o=mediasoup-client is generated by the browser library, so 'the SFU is mediasoup' is inferred from the protocol.
- VAP-19: enable_transcription, allow_sip and allow_dialout are Daily domain properties, not room metadata. The domain also shows PLAN_PAID and enable_metered_billing. The Twilio TURN-over-TLS path was forced by our sandbox.
- VAP-21: cf-ray IAD is our vantage's Cloudflare POP, not Vapi's origin. The NestJS inference is strengthened because the OpenAPI is served at /api-json, the @nestjs/swagger default.
- VAP-23: the OCITOKEN sits on the 167.150.224.0/24 sub-allocation (OCI-NETWORK-RANGE); the /23 is the docs range.
- VAP-30: '18 LLM providers' is not reproduced. Docs pages give 11 transcribers / 17 LLM / 15 voice; OpenAPI enums give 14 / 17 / 20.
- VAP-32: REA analyze-web-bundle died with a V8 'JavaScript heap out of memory' at about 8.07 GB of heap after about 506 s. The lane said '~6 GB RSS, no output before the 300 s timeout'. The rejected node's 'broke' is fixed.
- VAP-33: the EU region (Premier) comes from the docs eu-region page, not the pricing page.
- VAP-35: 'the only documented route' was wrong. Telnyx, Vonage, DIDWW, BYO SIP and the WebSocket transport are also documented; Twilio is the priced example. Hosting is 28-38% of the INR 12.5-17.0.
- VAP-41: '114 since 2024-10' is the RSS feed window, not Vapi's full history.
- VAP-42: the quote is verbatim; the generalisation to all SIP termination follows Vapi's stated reason. An Indian DID reseller's dev.to post (the lane's own india/ folder) claims +91 inbound to Vapi's SIP URI works; that is vendor-claimed and unverified.
- VAP-46: the 7-day and 15-minute limits are Dashboard limits. The API SchedulePlan has only earliestAt/latestAt, with no time-zone or retry field.
- VAP-48: ':india' appears only on legacy gpt-4-1106-preview.
- VAP-49: the normaliser and whole-file rejection are verbatim, but client-side only. The server's numberE164CheckEnabled defaults to true, so '+98xxxxxxxx' or '+0...' may be rejected rather than dialled (unknown). Server-side dedupe is also unknown.
- VAP-50: Hindi is a supported language (Vapi Voices v1 'hi'; Deepgram hi; Azure hi-IN, gu-IN).
- VAP-62: the marketing gap is narrower, given VAP-61.
- VAP-13: the count is 329 'call.' plus 2 'call-' (noted only).

CONFIRMED with re-run or re-read evidence
VAP-01, 03, 06, 09, 11, 12, 15, 16 (strengthened by the RCA's 'weekly cluster ... daily cluster'), 17, 20, 22, 25, 28, 29, 31, 34, 37, 38, 39, 40, 44, 45, 47, 54, 55 and 63.
- VAP-20 strengthened: the hostname is a CNAME to an AWS ELB in us-west-2 (k8s LB naming); the docs hostname has no A record at either resolver.
- VAP-55 strengthened: a status-page maintenance says 'Neon is doing scheduled maintenance in our region us-west-2'. The RCA itself never names the provider, so it stays inferred.

NOT RE-CHECKED
VAP-04, 07, 08, 10, 14, the vendor-claimed VAP-24, 26 and 27, and the failure-mode claims VAP-51, 56, 57, 58 and 59.
- VAP-52: support.vapi.ai is still behind its checkpoint. A web search shows the thread and a consistent snippet ('estimated is 875ms, actual is 3-4sec'); the forum text rests on snippets.

PREDICTIONS (predictions.json not edited; it is pre-registered)
All ten are falsifiable, but several are weak. Adopt these stricter rules before the account exists:
- P02 is near-certain as worded (holds_if ORs 'a second vendor account is required', which is documented). Score it on 'time to first ring >= 45 min AND displayed CLI is non-Indian'.
- P03 is near-certain ('manual multilingual config needed' is documented). Score it on 'with auto-detect on, >= 1 of 2 Hinglish calls replies in a non-Hindi language for >= 3 turns'.
- P04 and P05 mostly restate documented behaviour. P04's informative part is whether the server rejects or dials the '+98...'/'+0...' rows and dials duplicates twice. Score (b) and (c) separately.
- P06 needs switched-off or unreachable Indian numbers: use only SIMs we own.
- P09 is well-formed (p50 >= 2.4 s over >= 30 turns).
- P10's own inputs put the hosting share at 28-38%, so '>= 30%' can fail on the costlier stack. Fine as a test, but expect it to be marginal.

WHAT THIS MEANS FOR THE THREE DECISIONS (after verification)
Unchanged in direction, with tightened wording:
1. Pre-sale or post-sale first. Vapi does not settle this. On native telephony neither regulated Indian job (140xx promo or 1600xx service) can run, and any Indian buyer must bridge through an Indian CPaaS. VP's operator layer is the gap for a 1600-series post-sale job: series CLI, A2P declaration, consent, recurring windows and retries.
2. v1 parity floor. Vapi sets the developer-surface bar:
   - must-be: logs with a failure reason, export, and a pre-dial or suppression hook;
   - performance: a copilot builder that can run simulations, and versioning with traffic splits;
   - delighter: live listen and control (Mission Control alpha).
3. Where VP can be better. The five runnable tasks stand: +91 CSV hygiene, recurring windows with retries, a domestic series CLI, the Indian-PSTN reply gap, and business-language failure reasons. But:
   - the CSV test must check the server-side outcome;
   - 'Vapi cannot auto-improve' must not be claimed, because Composer under Bypass can fix, test and publish once a human starts it;
   - do not argue from Vapi's margin, which is unknown.

ACCOUNT-PHASE NEEDS added by the verifier
- What the server does with mis-prefixed CSV numbers.
- Whether customerId customers exist or can be created.
- Composer Bypass behaviour.
- Whether the Mission Control and Call Health flags are on for a new org.

REA as a tool: analyze-web-bundle fails by heap OOM on a 561-file SPA. That is a useful limit to log; the rejected node is corrected.
