# Exotel lane: adversarial verification

Date: 2026-10-20. Scope: every claim graded observed or inferred about architecture, pricing, India plumbing and v2
features, plus the docs/API and surface claims the three decisions lean on, and the 14 pre-registered predictions.

**How the checks were done:**
- Re-opened the cited files under `data/teardown/exotel/`.
- Re-ran the cheap captures:
  - DNS re-resolution;
  - two live doc fetches;
  - one `npm pack` of the current Exotel WebRTC core SDK, extracted and read without installing;
  - a Trustpilot re-read via WebFetch.
- Searched the lane's own saved doc corpus (341 + 915 pages) for counter-evidence.

The search for counter-evidence is where most of the corrections came from. Several "Exotel leaves X to the buyer"
claims are true of the Campaigns v2 / VoiceBot path but false of Exotel as a whole, because the ECC contact-centre docs
in the same corpus document X.

No sign-up, login, form, OTP or demo request was made. The Common Crawl index was tried once and refused (connection
reset or 504).

## Result

| | count |
|---|---|
| claims before | 64 (48 observed, 11 vendor-claimed, 5 inferred) |
| re-checked | 44 |
| confirmed as graded | 29 |
| corrected: wording wrong or over-broad, grade kept | 10 (EXO-03, 04, 09, 11, 13, 21, 32, 35, 37, 45) |
| downgraded | 5 (EXO-20, 22, 24, 30, 31) |
| refuted outright | 0 claims; 3 sub-claims refuted in place (EXO-09 AMD cell, EXO-37 magnitude, EXO-45 "page is dead" and "left to the buyer") |
| added by verifier | 6 (EXO-V01..V06) |
| claims after | 70 (51 observed, 13 vendor-claimed, 4 inferred, 2 unknown) |

The 20 claims not re-checked are:
- vendor-claimed claims outside the scope (EXO-06, 23, 28, 29, 38, 44, 50, 62);
- velocity, docs-hygiene and method counts (EXO-01, 02, 07, 08, 10, 17, 18, 39, 40, 52, 63, 64).

Of the 44 re-checked claims, 29 stood as written, 10 needed correction and 5 were downgraded. Of the 5 inferred claims, 2
did not survive (EXO-20, EXO-22), 2 were corrected (EXO-11 coverage, EXO-37 magnitude) and 1 stood (EXO-36).

## Changes, with reasons

### Downgraded

**EXO-20: inferred → unknown.** Claim: "the REST API and stream protocol are Twilio-shaped".
- The basis was:
  - Twilio-style placeholder ids in one doc;
  - the Singapore load balancer's name, 'twilix';
  - a memory of Twilio's API, not a saved source.
- Real Exotel ids are not Twilio-format. Docs payloads show 32-hex CallSids (e.g. in `voice-apis__answering-machine-detection-amd.md`), and AccountSids are names (forum `t18.json`: "Exotel171m").
- Pipecat needed a dedicated ExotelFrameSerializer, which suggests the wire format is not Twilio's.
- What decision 2 needs survives as EXO-V05 (observed): Exotel's own repo runs Pipecat through that serializer.

**EXO-22: inferred → unknown.** Claim: "Exotel runs its own orchestration, not LiveKit or Pipecat".
- Absence of client SDKs in a front-end bundle says nothing about the server behind the bot's WSS dp-endpoint. A Pipecat server behind a WebSocket is exactly what Exotel's agent-stream repo ships.
- The VoicebotTalkToBot chunk, the one place a client SDK would appear, was never captured. Only 46 chunks were saved; `routesConfig-CSrOOUEl.js` references about 140, so roughly 100 were never fetched.

**EXO-24: observed → vendor-claimed.** BYOK is a capability statement from a user guide. Only the model-configuration route is observed, and by the lane's own grading rule that is vendor-claimed.

**EXO-30: observed → inferred.** "No public web-call widget" is a universal negative from three page loads without clicks.

**EXO-31: observed → vendor-claimed.** A mixed claim, graded at its weakest part.
- Superset is now observed twice: the guest-token endpoint and a `superset` image in the ECC release notes.
- The Apache Camel engine is blog-only.
- The "Azure OpenAI scorer" comes from a personal repo's DEVLOG, not from Exotel.

### Corrected (grade kept)

**EXO-09, parity `voicemail_amd`: the claim was wrong.** It said "AMD is an ECC contact-centre licence only".
- `docs.exotel.com/voice-apis/answering-machine-detection-amd` (createdAt 2026-06-15) documents a **Beta Voice API AMD**:
  - enabled by the account manager;
  - `AnsweredBy` / `AmdCause` on Leg 2 in the terminal StatusCallback;
  - delivered about 3–5 s after answer;
  - not shown in reports or the dashboard.
- ExoML `create-a-leg` has `amd_enable` / `async_amd`, and ExoML Legs is one of the three documented AgentStream paths (`start_stream` on `leg_answered`).
- So AMD on a bot path is documented in pieces. What remains true: nothing documents AMD on Connect Voice AI, Campaigns v2 or the Voicebot applet, and the API version tells you only after the bot has been talking for 3–5 s.
- The lane had both AMD pages in its own `docs-md/` and cited only the contact-centre one.

**EXO-45, calling windows: two errors, in opposite directions.**
1. The lane said the calling-hours page "renders only as a client-side shell and its .md is 404". It is live:
   - HTTP 200, 7,506 bytes, at 18:36Z (in the lane's own refetch log) and again at 20:15Z;
   - saved at `data/teardown/exotel/verify-calling-hours/faqs__calling-hours.md`;
   - it says: "Exotel does not automatically enforce calling hour restrictions at the API level."
   That is stronger support for the API-level reading than the lane cited.
2. "Calling windows are left to the buyer" is too broad.
   - The Outbound Dialer guide documents a dashboard "Daily window" (9:00 AM – 9:00 PM) and a "Days of week" setting.
   - ECC Lead Management has per-lead daily Time Window slots, and "the lead remains disabled outside of the configured time slots".
   - Configurable windows therefore exist. Automatic enforcement does not, and nothing is documented for Campaigns v2 or the bot path.

**EXO-37, VP on AgentStream: refuted in magnitude, direction holds.** The lane mixed a per-connected-minute figure with a per-billed-minute one.
- It subtracted VP's 0.462, which is 0.43 per billed minute × the 30-s pulse overhead of 1.074, from Exotel's 0.80–1.00 per billed minute.
- It also dropped the 0.034 infrastructure cost already inside VP's 1.715.
- Like-for-like (Exotel's rate × the 60-s overhead of 1.149 on the same call mix):

  | | before | corrected |
  |---|---|---|
  | Exotel telephony per connected minute (INR) | not computed | 0.92–1.15 |
  | delta vs VP's Plivo model (INR/min) | +0.34 to +0.54 | +0.46 to +0.69 |
  | VP base-tier COGS before any stream fee (INR/min) | 2.02–2.22 | 2.17–2.40 |

  Computation: `python3 -I` one-liner in this pass.

**EXO-35, pulse inflation.** The 25% vs 12% figure assumes call lengths uniform on 0.5–3.5 min. On the VP model's call mix it is about 15% vs 7.4%.

**EXO-32, pricing history.** The claim said the /pricing hub "never carries prices". That is contradicted by l4a's own 2024-03-03 capture of `https://exotel.com/pricing/`, which carried them.
- Today's prices are observed.
- That the 2025–26 "quote-based" reading was an artefact is inference. The sub-page's 2025 history could not be checked: Common Crawl index connection resets / 504 on 2026-10-20.

**EXO-13 and EXO-04, overstatements.**
- EXO-13: MZ/CA/AC are doc placeholders, not Exotel's id format.
- EXO-04: 5 of the 21 "routes" are not screens. The same ECC app does register contact-centre contacts routes and ships voice-campaign code. "No campaign/contact route" holds only under `/voicebot/`.

**EXO-11, coverage caveat.** The "no contact, campaign, consent or opt-out object" claim rests on 46 captured chunks plus the MCP source. The bot API chunks (`botsApi`, `outcomesService`) were not captured.

**EXO-03, testing.** The docs show only phone testing, but the bundle has a `botTextTestingService` chunk and `text-sessions/ws` endpoints. An in-browser text test probably exists.

**EXO-21, source quality.** ClearStream is a personal repo (`Saurabhsharma209/ClearStream`), not an `exotel`-org repo.

### Confirmed with strengthened evidence

- **EXO-19.** Same CNAMEs and IPs on re-resolution at 20:18Z. All India IPs are in AWS ap-south-1 EC2 ranges. Vercel headers on exotel.com; Auth0 universal login.
- **EXO-25.** "SIP version 1.0.22" is the webrtc-core-sdk package-version banner (`webpack.config.js`: `'SIP version ' + pkg.version`). 1.0.22 shipped 2025-07-25, against 3.0.17 on 2026-10-16.
- **EXO-12.** dp-endpoint → `Calls/connect.json` re-read in source.
- **EXO-54.** TrustScore 2.5, 5 reviews, 100% 1-star, "Hasn't replied to negative reviews". Re-read via WebFetch, which is model-mediated; curl gets an AWS WAF challenge. Saved at `data/teardown/exotel/verify-trustpilot/webfetch-summary.txt`.

### Added by the verifier

- **EXO-V01 (observed).** AMD on the Voice API (beta) and on ExoML Legs (detailed above).
- **EXO-V02 (observed).** The ECC contact centre has tenant-level and process-level **DNC lists** ("They will not dial through any of the campaign or queues created under that tenant from Auto-Dial") and disposition-triggered Do Not Call. Opt-out suppression is not "left to the buyer" at Exotel as a whole, only on the Campaigns v2 / bot path.
- **EXO-V03 (observed).** Exotel's scheduling docs contradict each other:
  - Campaigns v2: one absolute window;
  - FAQ: no automatic enforcement;
  - Outbound Dialer: a daily window plus days of week;
  - ECC: per-lead time windows.
- **EXO-V04 (observed, with an inferred reading).** ECC 6.x ships as about 30 container images pulled from `bom.ocir.io`, Oracle Cloud's Mumbai registry:
  - images: appserver, ccdp, kafka-connect, ksqldb, schema-registry, citus/postgresql 18, redis, eureka, ingress-nginx, superset, fluentd and others;
  - inferred reading: a Kubernetes, Spring Cloud and Kafka stack distributed via OCI;
  - unknown: whether ECC SaaS runs on OCI or AWS. "Exotel is on AWS" holds for the CPaaS and voicebot hosts only.
  - This also shows CCDP is a shipped component, so EXO-60's "marketing ahead of docs" is about its memory function, not its existence.
- **EXO-V05 (observed).** Exotel's agent-stream repo runs Pipecat with ExotelFrameSerializer.
- **EXO-V06 (observed, process).** The account-phase plan conflicts with an owner-accepted mitigation.
  - `risk.2026-10-20.vendor-terms` is `accepted-by-owner`, with mitigation "Exotel account not used for the teardown". The reason is ToS §6.2, a standalone promise not to "build a product or service which competes with the Product".
  - This lane's checklist for Instinct, EXO-P01..P14 and `open.2026-10-20.exotel-account-phase` all assume an Exotel trial under team@vyakti.ai.
  - **Do not hand Instinct an Exotel sign-up until the owner decides this, or a written agreement exists.**

## What changes for the three decisions

1. **Pre-sale or post-sale first.**
   - Exotel's API path still enforces nothing on calling hours. It says so outright.
   - Its contact centre does have DNC lists and per-lead time windows, so "compliance is a platform job nobody does" is weaker for buyers already on Exotel ECC.
   - The post-sale-first argument does not depend on Exotel either way.
2. **v1 parity floor.**
   - A DNC/opt-out list and a per-day calling window are parity with the Indian contact-centre incumbent, not a differentiator. Move them to must-be.
   - AMD exists at Exotel (beta, API-only, after 3–5 s), so AMD belongs on the floor too.
3. **Where VP can be measurably better.** Of the five proposed tasks:
   - **Narrowed:** "enforced calling windows and DND/consent records" and "voicemail detection on the bot path". The defensible version is VP applying them by default on the bot path, before the bot speaks, in one console. Exotel has them only in ECC, behind an account manager, or after 3–5 s.
   - **Untouched:** "list-to-calls in one console with normalisation", "actionable failure reasons + single export" and "same-day self-serve start".
   - **Corrected:** the VP-on-AgentStream cost penalty is larger than the lane said (+0.46 to +0.69 INR/min). That strengthens "keep Plivo primary".

## Predictions: falsifiability check

Every prediction states a quantity and a pass rule, but five have problems that would let them pass for the wrong
reason. Suggested amendments are below. `predictions.json` was not edited: pre-registration should be amended by the
main loop, and before any account exists.

| id | problem | suggested amendment |
|---|---|---|
| P02 | The "OR KYC/enablement is demanded" disjunct is already true from the docs, so the prediction passes whatever the timing. | Score on elapsed time only (≥ 2 business days). |
| P03 | "No in-browser test call" is at risk: the bundle shows text-session testing. | Say "no in-browser *voice* test"; record text testing separately; lower confidence. |
| P04 | "Duplicates dropped silently" contradicts the documented `duplicate_count` in the upload response. The opt-out sub-claim depends on the path (ECC has DNC lists). | Drop "silently"; fix the path as Campaigns v2 + App Bazaar. |
| P05 | "No daily-window control" is contradicted by the Outbound Dialer guide's "Daily window". | Scope to the Campaigns v2 / call-campaign UI used with the Voicebot flow; lower confidence. |
| P06 | AMD exists as an account-manager-enabled API beta. | Scope to "no AMD option in the trial's bot-campaign UI"; record whether the CSM offers the beta. |
| P07 | "Actionable" is undefined. | Define it: the UI names the cause and the fix (e.g. "number invalid", "tool URL 404") without opening a second console. |
| P12 | Tests a prompt we write, at n = 5. It measures the LLM default, not an Exotel control. | Keep as a low-weight check or drop. A platform-level disclosure control is the Exotel-relevant question. |
| P13 | The "OR price withheld" disjunct makes it easy to pass. | Score the two halves separately. |

P01, P08, P09, P10, P11 and P14 are falsifiable as written.

All predictions also depend on resolving EXO-V06 first.

## Files touched in this pass

**Edited:**
- `research/2026-10-20/teardown/exotel/claims.json`: grades and claims edited in place; originals kept in `claim_before` and `verification.grade_before`.
- `research/2026-10-20/teardown/exotel/report.md`: Verification section appended.
- `research/2026-10-20/teardown/exotel/parity-delta.csv`: voicemail_amd and compliance rows corrected.
- `research/2026-10-20/teardown/exotel/manifest.csv`: new raw files appended.
- `context/inbox/teardown-exotel.json`: corrected nodes, plus one verification node and an event.

**New raw files:**
- `data/teardown/exotel/verify-dns/getent-recheck.txt`
- `data/teardown/exotel/verify-calling-hours/{faqs__calling-hours.md,outbound-dialer.md}`
- `data/teardown/exotel/verify-npm-webrtc-core/exotel-npm-dev-webrtc-core-sdk-3.0.17.tgz` (extracted under `x/`, not installed)
- `data/teardown/exotel/verify-trustpilot/webfetch-summary.txt`

**Not verified:**
- the pricing sub-page's 2025 history (Common Crawl refused);
- any server-side orchestration signal;
- the roughly 100 uncaptured console chunks;
- Exotel's ECC SaaS hosting location;
- the r2 TRAI PDFs, which were re-cited rather than re-opened.
