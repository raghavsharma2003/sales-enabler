# Sarvam lane: adversarial verification

Verifier pass, 2026-10-20. Inputs: `research/2026-10-20/teardown/sarvam/claims.json` (62 claims), `predictions.json`,
`manifest.csv`, `context/inbox/teardown-sarvam.json`, and the raw artifacts under `data/teardown/sarvam/`. The lane's
`report.md` did not exist on disk; the verifier created it (findings index generated from the verified claims, plus the
Verification section).

## Method

Default to downgrading when the evidence does not carry the grade. For each claim in scope the cited file or URL was
re-opened and the claim was re-derived from it, not from the lane's wording. Cheap captures were re-run:

| re-check | how | n | result |
|---|---|---|---|
| DNS for 7 hosts | Cloudflare and Google DoH, 19:16Z, saved to `data/teardown/sarvam/verify/doh-recheck-2026-10-20.jsonl` | 14 lookups | apps/agents -> 4.213.213.141 (Azure centralindia); api -> AWS ELB k8s-vistaar (IPs rotated); mp.platform -> AWS ELB k8s-saasprodplatforma; k -> PostHog cf-prod-us proxy; cdn -> Azure Front Door; status -> Vercel |
| IP ownership | ServiceTags_Public_20261012 (changeNumber 422), AWS ip-ranges 2026-10-20, saved RDAP | 5 IPs | all as claimed |
| Widget audio | decoded every server.media.audio_chunk in the 8 round-2 dumps | 12,420 chunks | 11,983 x 3,200 B at 16 kHz, 8 x 1,600 B at 8 kHz, 429 empty; 0 RIFF headers |
| WebRTC | `pcs` field in the 8 round-2 recordings | 8 calls | 0 peer connections in 8 of 8 |
| Rate card | recomputed every row of pricing-allin.csv from pricing.md | 36 rows | 0 mismatches |
| API-list COGS | Growth STT 0.41 + Bulbul V4 Flash 1.70/1k chars x 352 + Sarvam-105B | 1 stack | 1.17-1.33 |
| Docs bounded negatives | word-bounded grep over the saved docs pages | 162 pages | NCPR/DLT/140x/1601/A2P/CNAP/DPDP 0; TRAI 1 (NDNC failure-reason example) |
| Manifest | sha256 and size of every row; unlisted files | 577 rows (before the verifier added 2) | 577 match; 0 unlisted |
| npm SDK date | `npm view sarvam-conv-ai-sdk time`, saved | 1 | 0.0.42 on 2026-03-30T11:19Z |
| PostHog | bundle init options and remote config in the login HAR | 2 projects | main project: replay on, inputs unmasked, network bodies and headers captured, ui_host us.posthog.com |

Not re-run: the homepage widget calls (the 2026-10-17 dumps were re-analysed instead), the lab latency numbers (the
2026-10-19 result file was re-read), any logged-in view (needs an account).

## Result: 30 confirmed, 16 corrected, 3 downgraded, 2 refuted, 1 regraded, 10 not re-checked, 1 split, 3 added

### Refuted

- **SAR-07** (inferred -> unknown). The gate retired on 2026-08-06 was for Coding Agents / Work Agents (event descriptions), so it says nothing about Voice Agents. The first Voice Agents changelog entry (2026-08-13) dates the changelog section, not self-serve opening. When Voice Agents became self-serve is not observed.
- **SAR-31** (inferred -> unknown). The bundle's environment switch maps production to api.sarvam.ai (AWS, k8s-vistaar ELB) and staging to api.saas-staging-vistaar.sarvam.ai (the same "vistaar" name as the AWS prod ingress); only QA/stage01 hosts carry "azure". The Mixpanel proxy runs on an AWS EKS-style ingress named saasprodplatform. Platform components sit on both clouds; nothing here shows Azure is primary.

### Downgraded or split

- **SAR-26** (inferred -> inferred). Narrowed. No WebRTC in 8 calls and a browser-to-server JSON WebSocket rule out a LiveKit or Daily room on the web path. They do not rule out a server-side framework: Pipecat (and similar) run behind custom WebSocket serializers, so client bundles and the SDK would not show them. The server-side orchestration framework is unknown.
- **SAR-29** (inferred -> unknown). Which open-weight models run in the voice stack is not observed. The API price list shows what Sarvam resells, not what its voice router uses, and the one routing report (GLM 5.2) is about Work Agents/Cowork, a different product.
- **SAR-38** (observed -> inferred). All 36 rows of pricing-allin.csv recompute exactly from the rate card. But it is a computation, not an observation of billing: whether debits follow the rate card is what SAR-P13 tests. Also, 30-90 s calls are not all 4.6-7.4: a 60-s call is 3.40-3.90, and the non-whole-minute range across plans is 4.40 (Business 90 s) to 7.40 (PAYG 30 s).
- **SAR-39b** (inferred -> unknown). Split out of SAR-39 by the verifier: the proxies are not Sarvam's models (Saaras, Bulbul, Sarvam-105B) and their throughput is assumed, so the margin is not supported.

### Corrected (grade kept, claim text fixed)

- **SAR-04** (corrected; observed -> observed). Team counts were counted by event-name prefix, not by the owner field. By owner: platform-team 202, samvaad-team 158 (prefix counts 175 and 142). 583 of 700 events are active; 77 carry an activation role (aha 35, setup 34, habit 8). agents.agent.deployed is also an aha event.
- **SAR-06** (corrected; observed -> observed). The catalogue says the org-profile step was dropped on 2026-08-07 ("current onboarding is role -> product -> welcome only"); phone and volume are Voice Agents onboarding steps. The retired product gate is described as the gate for "Coding Agents / Work Agents", not Voice Agents.
- **SAR-12** (corrected; observed -> observed). The "no model picker" sentence in the docs is about the LLM. The TTS model is chosen per agent (Bulbul V3 or V4; V3 end of life on Voice Agents 2026-11-10).
- **SAR-20** (regraded; inferred -> vendor-claimed). Not an inference: the Boards SQL API page states "Sarvam's analytics store is ClickHouse" and returns a CLICKHOUSE_ERROR code. It is a vendor statement in the docs, not something we observed in the system.
- **SAR-22** (corrected; observed -> observed). DNS and region confirmed, but (a) ELB IPs rotate: at 19:16Z the A records were 16.4.106.174 and 43.205.26.180; (b) "Kubernetes ingress" is an inference from the AWS Load Balancer Controller naming convention k8s-<namespace>-; (c) api.sarvam.ai is also the dashboard's production API base URL (bundle: NEXT_PUBLIC_API_BASE_URL default), so it is not only the model front door.
- **SAR-24** (corrected; inferred -> inferred). The two-cloud, both-Mumbai/Pune picture holds for the call runtime and the API endpoints, but the split is not "control plane on Azure": the dashboard's prod API base (api.sarvam.ai) and the Mixpanel proxy (mp.platform.sarvam.ai, ELB k8s-saasprodplatforma-...) are AWS Mumbai; the dashboard frontend (cdn.sarvam.ai) is on Azure Front Door, a global anycast CDN; and dashboard product telemetry and session replay go to PostHog's US cloud (SAR-63). The residency fit is for the runtime and API endpoints only.
- **SAR-25** (corrected; observed -> observed). Transport confirmed (8 calls, pcs=0 in all 8 recordings; SDK getSignedUrl() sends X-API-Key; message types present in the SDK). Correction: the chunks are labelled format audio/wav but none of 12,420 decoded chunks carries a RIFF header; they are raw PCM (3,200 bytes = 100 ms at 16 kHz 16-bit; 1,600 bytes on the 8 kHz chunks). The 16-bit width is inferred from that framing. SDK output rates are 16 or 22.05 kHz.
- **SAR-35** (corrected; inferred -> inferred). Kept as inference but narrowed. The two numbers are not like-for-like: the demo p50 is browser-side from a US-East vantage; ours is server-side on an India VM with our own endpointing. "The same models" is not established: the platform routes among several LLMs and the demo's TTS version is unknown. Even allowing ~0.3 s for vantage and ~0.1 s for the browser, a gap of about 1.5 s remains that the public-API model speed does not explain.
- **SAR-37** (corrected; observed -> observed). Confirmed and extended: the marketing page's structured plan data also carries monthly fees that differ from the docs: Pro INR 2,000, Growth 10,000, Business 50,000 (docs: 9,999 / 49,999 / 2,00,000).
- **SAR-39** (corrected; inferred -> inferred). Split. The API-list part recomputes: Growth STT 0.41 + Bulbul V4 Flash 1.70 per 1,000 chars x 352 = 0.60 + Sarvam-105B 0.16-0.32 = 1.17-1.33 (the lab's PAYG 1.39-1.51 agrees). The self-hosted compute figure and the 89-93% margin are moved to SAR-39b and graded unknown.
- **SAR-40** (corrected; inferred -> inferred). Two parts fail. (1) "Already posts the lowest Indian list price": SquadStack quotes INR 2-5/min including telephony and Ravan.ai's enterprise tier is USD 0.02-0.04 (INR ~1.8-3.5) in pricing-history.json; Sarvam's INR 3.50 is the lowest self-serve PAYG rate tracked. (2) The "5-10x compute cushion" rests on SAR-39b (unknown) and does not match its own inputs (3.00/0.34 = 8.8x to 3.50/0.24 = 14.6x). Kept: list price is 2.3-3.0x its own API list cost.
- **SAR-41** (corrected; observed -> observed). Confirmed, and the 2026-08-18 entry shows sarvam-105b was first raised from INR 4 / 2.5 / 16 to 29.28 / 10.98 / 73.2 per 1M tokens before the 2026-10-10 cut to 15 / 5 / 60. Two LLM reprices in eight weeks.
- **SAR-44** (corrected; observed -> observed). The bounded negative is slightly wrong. Over the 162 saved docs pages, "TRAI" appears once, in the instant-outbound webhook example failure_reason "exotel: Phone number is registered under TRAI NDNC": a BYO provider's NDNC rejection surfaces as a failure reason. NCPR, DLT, 140x, 1601, A2P, CNAP and DPDP: 0. The DND page quote is verbatim.
- **SAR-48** (corrected; inferred -> inferred). The exposure inference follows from RS-09 (only 140/1600/1601 CLIs are protected from spam flagging and the A2P termination charge). Calling it a "spam-evasion pattern" is a judgement no cited TRAI text makes; no regulatory text on CLI rotation was cited.
- **SAR-58** (corrected; observed -> observed). Doc facts confirmed; no cross-call memory in the 162 pages (only a BYOK in-memory key cache). The "marketing and docs disagree" conclusion does not hold: "Memory: Private" sits in a privacy panel (Conversation data / Context / Memory / Transcripts), and "carry your customer context into every call" is consistent with the per-call variables and on-start hooks the docs describe. Whether a cross-call memory feature exists is unknown.
- **SAR-61** (corrected; observed -> observed). The lists are right; the "lean post-sale" reading is not. Cart Recovery is a pre-purchase sales nudge, and Lead Qualification and Pre-approved loans are pre-sale; the page's own line is "Sales, collections, support, bookings". The one productised vertical, Cart Abandonment, is a pre-purchase job.
- **SAR-62** (corrected; inferred -> inferred). Rebased on the corrected SAR-61/38/40/63: Sarvam is broad, not converging on post-sale; its deepest observed post-sale investment is collections (EMI demo with a full disposition model, Tata Capital). Price is INR 3-3.5 list but 4.4-7.4 effective on short non-whole-minute calls; India residency is a vendor claim with a telemetry counterexample.

### Added by the verifier

- **SAR-63** (observed). The dashboard's main PostHog project records sessions. The bundle initialises it with api_host k.sarvam.ai, ui_host us.posthog.com, disable_session_recording false and maskAllInputs false; its remote config, fetched on the public login page, enables session recording at no sample limit (sampleRate null, 30 s minimum) with network body and header capture, console logs and canvas, and maskAllInputs false. k.sarvam.ai CNAMEs to *.cf-prod-us-proxy.proxyhog.com. The recorder script loaded on the login page; no replay upload was seen in the short capture.
- **SAR-64** (inferred). Logged-in dashboard sessions, which show transcripts, recordings and contact numbers, are probably recorded to PostHog's US cloud with request and response bodies, unless Sarvam masks those views (a privacy-mask attribute exists in the block selector). That would contradict "all data, including any PII, stays within India" for the dashboard, though not for the call path.
- **SAR-65** (inferred). Sarvam's productised Cart Abandonment vertical provisions a Sarvam-rented number after KYC (auto-purchase), and rented numbers are 11/79/80-series 10-digit CLIs (SAR-45). If cart-recovery calls are promotional, as a call meant to induce a purchase probably is, TRAI requires a 140xx CLI, which Sarvam does not offer. The regulation lane's job matrix does not classify cart recovery, so the promotional reading is ours.

## The findings that most change the lane's conclusions

1. **Cart recovery is pre-sale.** The lane read Sarvam as "converging on post-sale" partly because its one productised
   vertical is Cart Abandonment. A cart-recovery call is made before a purchase, so the vertical is pre-sale and probably
   promotional; the post-sale overlap with VP is collections and EMI reminders, not the whole post-sale field.
2. **Short-call economics are computed, not observed, and the range was misstated.** The arithmetic is exact, but a 60-s
   call is INR 3.40-3.90/min; the INR 4.40-7.40 range applies to calls that are not whole minutes. Billing behaviour is
   what SAR-P13 will test.
3. **The self-hosted margin is unsupported.** The 89-93% compute margin came from proxies of other models with
   throughput nobody has measured. Only the API-list comparison (2.3-3.0x) survives.
4. **Residency has a dashboard hole.** The call runtime and APIs are India-hosted, but the dashboard's main PostHog
   project is configured to record sessions with network bodies to a US-hosted PostHog. If logged-in pages are not
   masked, transcripts and contact numbers shown there leave India. This needs one logged-in capture to confirm.
5. **Architecture: one cloud is not primary.** Production's API base and the Mixpanel proxy are AWS, and the voice
   runtime is Azure. And the absence of WebRTC excludes only LiveKit/Daily rooms, not a server-side framework.

## Predictions: falsifiability

| id | falsifiable | note |
|---|---|---|
| SAR-P01 | yes | Stopwatch from the sign-up page load to the handset ringing; clicks counted from a screen recording. |
| SAR-P02 | weakly (compound or) | 2026-10-20 verifier: weakly falsifiable as written (an 'either ... or' with an inner 'or'). Score it as two items: P02a the rented-number path needs KYC that takes at least 1 business day or cannot complete for a team account [hit/miss]; P02b connecting BYO Plivo takes 20-40 min [hit/miss]. Prediction text left unchanged. |
| SAR-P03 | yes | Read the generated instruction; ask "aap AI ho?" on a test call. |
| SAR-P04 | yes | Upload the fixed messy CSV; read the valid/removed counts and the rejected file; check whether the duplicate and opt-out rows are dialed (synthetic numbers only). |
| SAR-P05 | yes | Try a 07:00-23:00 window; record any warning. |
| SAR-P06 | yes | 3 voicemail trials on our own SIMs (switched off, unanswered with operator voicemail, busy) and 2 transfer trials to our second number. |
| SAR-P07 | yes | Stopwatch; check against our induced failure (wrong or busy number). |
| SAR-P08 | yes | Export once; list the columns. |
| SAR-P09 | yes | 2026-10-20 verifier: falsifiable. The basis compares a browser-side US-East demo number with a server-side India-VM number (see SAR-35 verification), so the 1.6-2.4 s interval is wide on purpose; keep the scoring rule (handset-side VAD, n of at least 30 clean turns, CI clustered by call). |
| SAR-P10 | yes | Elderly persona, 4 calls per setting. |
| SAR-P11 | yes | Azure LID plus manual reading. |
| SAR-P12 | yes | Bhojpuri+babble persona, 2-4 calls. |
| SAR-P13 | yes, once the debit unit is fixed | 2026-10-20 verifier: ambiguous on what is debited. Credits are bought with GST split at collection (SAR-09), so the credit ledger should show ex-GST amounts. Score: 45-s call debits 3.90 credits (3.50 agent + 0.40 telephony); 61-s call debits 7.60 credits (7.00 + 0.60); a simulated test run debits 2 credits. GST is checked on the top-up invoice, not per call. Prediction text left unchanged. |
| SAR-P14 | yes | Configure a test agent with that instruction (synthetic, our own phone only) and ask "are you a bot?". |

## Residual risks the verifier could not close

- DNS was resolved from one US sandbox through two public resolvers; GeoDNS answers from India were not tested.
- The round-2 WebSocket dumps live in an ephemeral scratchpad directory; only their summary JSON is under
  `data/teardown/sarvam/ws/`. The chunk-level checks above cannot be repeated once the container is gone.
- SAR-63 shows configuration, not traffic: no replay upload was captured in the short anonymous session.
- SAR-65 rests on our own reading that cart-recovery calls are promotional; the regulation lane did not classify it.

## Files changed

- `research/2026-10-20/teardown/sarvam/claims.json`: grades and claim text edited in place; every re-checked claim has a
  `verification` object (result, grade before and after, note, evidence, date); replaced text kept as
  `claim_before_verification`; SAR-39b, SAR-63, SAR-64, SAR-65 added.
- `research/2026-10-20/teardown/sarvam/report.md`: created (did not exist), with the Verification section.
- `research/2026-10-20/teardown/sarvam/predictions.json`: `verifier_note` on SAR-P02, P09, P13.
- `research/2026-10-20/teardown/sarvam/manifest.csv`: 2 rows added for the verifier's saved re-checks.
- `context/inbox/teardown-sarvam.json`: 10 nodes corrected, 1 node, 4 edges and 1 event added; validated with
  `scripts/lib/context-schema.mjs` nodeErrors (0 errors) and all edge ends exist.
- New raw artifacts: `data/teardown/sarvam/verify/doh-recheck-2026-10-20.jsonl`,
  `data/teardown/sarvam/verify/npm-conv-ai-time-2026-10-20.json`.

