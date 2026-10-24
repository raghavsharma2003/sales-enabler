# Squadstack verification (2026-10-20)

## Verification (adversarial verifier, workflow wf_560edf6c-5d6)

- Checked: 36; confirmed: 19; downgraded: 2; refuted: 5
- Hit rate: 19/36 confirmed unchanged; 28/36 substance held (the other 9 needed wording fixes only); 5 refuted in part; 2 observed->inferred; 1 upgraded (SQS-69 unknown->inferred); 7 new observed claims added (SQS-70..76)

### Refuted

- SQS-21: Refuted in part. h=["eleven_multilingual_v2"] is a hide-list: the model is hidden unless an agent already uses it. It is not the default; the TTS module's default constant is eleven_flash_v2_5. [sarvam, cartesia, squadstack_ws, arc_stt] is not an STT provider enumeration but an internal-only filter (hidden without view_internal_voice_options) used by both the TTS and STT pickers. arc_stt is an STT router (fallback / best-latency / load-balance, fallback_chain, weights). Evidence: chunk 8449 plus the agent-editor page chunk I downloaded.
- SQS-33: Refuted in part. rea-ai-platform-web-bundle.json, written 18:32:51Z, 28 s after the 280 s timeout fired (the orphaned child kept running), is a complete analyze-web-bundle result: 34 scripts parsed, 0 failures. So 'no output' is wrong. Its value was near zero: Next.js/React fingerprints, 1 route, 1 endpoint, and source maps 'not_requested' despite --fetch-source-maps.
- SQS-41: Refuted in part. The COGS arithmetic reproduces on all 15 rows, but 'ElevenLabs Multilingual v2 (the bundle default)' is wrong: ML v2 is hidden legacy and Flash v2.5 is the default constant. On Flash, COGS is INR 1.95-3.58: a 15-36% loss at INR 2 and a 23-34% mid margin at INR 3.5, not break-even. The in-call LLM line is a proxy; the editor names OpenAI, SimpliSmart, AWS Bedrock and OpenRouter.
- SQS-49: Refuted in part (the window half). The AI-platform layout chunk the lane had downloaded, and the Osno layout, show 'The system will pause all calling activities daily from 11:00 PM to 9:00 AM' (shown when hour >= 23 or < 9). The only window in code is 09:00-23:00, not 9:30-20:30. That is wider than the 10:00-21:00 default promotional band. The number-rotation half stays inferred.
- SQS-10: Refuted in part. The agent-editor chunk has call-closing triggers transfer_call(), send_link(), hangup_call(), dnd_request() and schedule_callback(), plus a 'Live Seller Transfer' custom-scenario placeholder. A transfer tool exists, so 'no self-serve transfer control' is wrong. Its destination (any PSTN number or the managed pod) is not visible. The 301 on the old page was re-confirmed.

### Downgraded

- SQS-23 (observed -> inferred): The SDK facts are observed: Pipecat client-js 1.13.1, daily-transport 1.6.9, daily-js 0.90.0 and POST /bot/connect. That the server-side orchestration is Pipecat is inferred from the client protocol; no server artifact was seen.
- SQS-27 (observed -> inferred): There was no saved GitHub artifact (sdk/gh-org-*.json are proxy refusals). I re-read the org via WebFetch: 82 repos, including django-*, DRF, celery-beat, pghero, terraform-aws-* and label-studio copies. The portal uses csrftoken / x-csrftoken. Public library copies plus Django-default CSRF names support a Django backend but do not prove it.

### Notes

Scope. I re-checked every observed or inferred claim on architecture, pricing, India plumbing and v2 (29), plus 7 surface or account-phase claims that feed inbox nodes (SQS-04, 10, 11, 16, 18, 68, 69). I re-opened every cited file. I also made fresh public captures with no login and no forms:
- the app.osno.ai build (28 chunks);
- the ai-platform route shells, which the server sends before the client-side auth redirect, plus 20 chunks the lane had not captured, including the 518 KB agent-editor page chunk;
- redirect headers for 4 URLs;
- the GitHub org and lens-mcp pages, via WebFetch.
All 62 new raw files have rows (path, bytes, sha256, source URL, fetch time) appended to manifest.csv.

Biggest new findings (all observed, client-side code):
1. Sign-in is allowlisted on both ai-platform.squadstack.ai and app.osno.ai (SQS-70). ENABLE_EMAIL_DOMAIN_RESTRICTION is true, so only squadstack.ai/.com addresses or allowlisted emails get in. Everyone else sees 'Sign in is temporarily disabled for external users'. Osno also checks a per-user record with an expiry date. A team@vyakti.ai sign-up will fail at sign-in.
   - For the Instinct account-setup prompt the user asked for: leave SquadStack and Osno off the list. Getting past the gate without SquadStack provisioning access would be an authentication bypass, one of the lines kept in decision.2026-10-20.teardown-lines. The owner's terms override (directive.2026-10-20.terms-override) does not change this. The only routes are a sales/demo request under VP's identity (needs the owner's go) or buyer interviews.
2. The editor has call tools: transfer_call, dnd_request, schedule_callback, send_link, hangup_call, test call, and inbound-number generation (SQS-72). In-call LLM providers named are OpenAI, SimpliSmart, AWS Bedrock and OpenRouter (SQS-73). Memory in code is intra-call only (SQS-74).
3. The calling window in code is a 23:00-09:00 pause (SQS-71).
4. Plug-N-Play, the only wallet flow, sells human tele-callers, not AI agents (SQS-76).
5. docs.squadstack.com 301-redirects to the Postman API docs (SQS-75).

Other changes:
- 9 wording corrections: SQS-22, 24, 32, 40, 42, 47, 52, 65, 68.
- SQS-67 annotated: the Terms are overridden by the owner; the allowlist is the real blocker.
- Grades are now 50 observed, 14 inferred, 12 vendor-claimed, 0 unknown (76 claims; before: 45/11/12/1 of 69).
- Each re-checked claim in claims.json now carries a 'verification' object with the verdict, reason and before-text.

Predictions:
- All 14 are falsifiable. I left them unchanged to keep the pre-registration honest.
- P03, P05 and P07 rest on premises corrected above. As written, P05 will probably score false.
- P02's premise is now observed (p of about 0.95), so score it from the bundle, not an account.
- P12 and P13 carry little information. Tighten P13 to one price structure before scoring.
- P10's basis wrongly assumes the in-call LLM is Gemini Flash.

Decision effects:
- The compliance wedge is stronger: no 140/1600, and the window leaves 21:00-23:00 and 09:00-10:00 open for promotional calls. But SquadStack does capture in-call DND.
- 'Minutes to first live call' and 'real-time AMD' are stronger.
- 'Transfer' moves to the parity floor.
- On Flash TTS, SquadStack can price at INR 3.5 profitably, so VP's case cannot rest on SquadStack being underwater at INR 2-3.5.

Inbox: context/inbox/teardown-squadstack.json still has 14 nodes and now 27 edges; every node passes the repo's nodeErrors schema and every edge target exists.
- Corrected: lane, architecture, self-serve risk (now 'a flag flip, not a build'), COGS measurement, compliance surface, claims-inconsistent, where-vp-wins (transfer dropped, window added), REA rejection (broke text fixed), account-phase open question (blocker is the allowlist, not the Terms; edge to decision.2026-10-20.teardown-lines), and v2 memory.
- Added evidence.2026-10-20.squadstack-verification, with edges verifies/corrects.
- Added a teardown_verify_squadstack event.

Files:
- report.md had been filled from the lane's output. A Verification section is appended, listing every change with its reason and which earlier report text is now wrong.
- verify.md was NOT created: the subagent rule forbids new report .md files. /home/user/sales-enabler/research/2026-10-20/teardown/squadstack/verification.json holds the same content as data (per-claim before/after, prediction review, decision impact, hygiene).
- Hygiene: the Osno bundle hard-codes 15 external email addresses. They stay only in the gitignored raw file and are reproduced nowhere. The Lens key was not reproduced or used.

Paths:
- /home/user/sales-enabler/research/2026-10-20/teardown/squadstack/claims.json
- /home/user/sales-enabler/research/2026-10-20/teardown/squadstack/report.md
- /home/user/sales-enabler/research/2026-10-20/teardown/squadstack/verification.json
- /home/user/sales-enabler/research/2026-10-20/teardown/squadstack/manifest.csv
- /home/user/sales-enabler/context/inbox/teardown-squadstack.json
- /home/user/sales-enabler/data/teardown/squadstack/verify-osno-js/
- /home/user/sales-enabler/data/teardown/squadstack/verify-aiplatform-editor-js/
- /home/user/sales-enabler/data/teardown/squadstack/verify-headers/

Nothing was committed, and graph.json was not edited.
