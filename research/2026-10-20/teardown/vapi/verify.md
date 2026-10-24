# Vapi verification (2026-10-20)

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
