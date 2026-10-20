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
