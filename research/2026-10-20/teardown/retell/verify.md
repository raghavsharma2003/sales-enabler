# Retell verification (2026-10-20)

## Verification (adversarial verifier, workflow wf_560edf6c-5d6)

- Checked: 41; confirmed: 23; downgraded: 4; refuted: 4
- Hit rate: Of the 41 lane claims re-checked, 37 kept their grade (90%) and 23 needed no text change (56%). No whole claim was refuted. Four were downgraded, 14 kept their grade with corrected text, 5 sub-statements were refuted, and 7 claims were added. Of the 12 predictions, 5 are falsifiable as registered and 7 only partly. RET-P01's sign-up clause was already known when it was registered (Instinct's ~10-min sign-up at 16:16-16:49Z, before the 17:41Z predictions file).

### Refuted

- inbox evidence.2026-10-20.retell-hosting-media ('Hosting is US-West only'): Refuted as worded. Client-subnet DNS shows the legacy LiveKit Cloud host in the web SDK sends Indian subnets to 143.223.94.x, the /24 that LiveKit's RDAP labels production-ohyderabad1a-main. Only Retell-operated hosts (sip, mcp; api is anycast) are US-West and un-geo-routed. Node rewritten; new claims RET-61 (observed) and RET-62 (inferred).
- RET-46 / inbox india-compliance-absent ('post-sale service calls need less compliance'): Wrong for BFSI, which includes VP's insurance-renewal beachhead. Ledger REG-10 and REG-20 require service and transactional calls to come from 1600-series numbers whatever the consent. Retell cannot supply those numbers (US/CA only), and its +1-to-India route is out. Corrected in place; new claim RET-64.
- RET-37 sub-claim ('reaching INR 3 would need Indian hosting'): The gap is the platform fee: the infra line alone is USD 0.055, about INR 5.2/min. Hosting location changes latency, not the rate card. The ratios were also off: 1.2-3.8x the 3.55-7 band (not 2-4x), inside the 8-18 band other Indian vendors post, and 2.8-6.8x VP's INR 2-3 target.
- RET-P03 and RET-P12 basis ('no disclosure control documented / no disclosure setting in AgentRequest'): The OpenAPI has HandbookConfig.ai_disclosure, and the docs say the 'AI Disclosure When Asked' preset is on by default for new agents (llms-full lines 4754, 4864, 4897). Agents built through the Claude connector open with 'Hi, this is an AI assistant'. New claim RET-63. Pre-registered text kept; verifier_check scoring fixes added.

### Downgraded

- RET-22 (inferred -> inferred (narrowed) + RET-22b unknown): The SIP allowlist supports 'some media lands on LiveKit-owned addresses'. Nothing observed supports 'Retell does not rent LiveKit as its agent framework', so that part moved to RET-22b, graded unknown.
- RET-24 (inferred -> vendor-claimed): Once the observed SDK transport migration (RET-23) is set aside, what is left is Retell's own postmortem description of its queues, containers and workers, which is vendor text. 'No Pipecat or Vocode traces in the SDK or docs' says nothing about the server side.
- RET-33 (observed -> inferred): pricing-history.json records the 0.07-0.31 headline only on 2024-12-06. The 2025-06 and 2026-06 captures did not record a headline, so 'unchanged since Dec 2024' rests on two endpoints, and the price structure behind the headline changed in between. The 'headline is not a ceiling' half is observed and kept.
- RET-36 (inferred -> inferred (line items) + RET-36b unknown): On the lane's own inputs the infra margin is 72-86%, not 75-85%, and it rests on an unmeasured compute assumption that leaves out any LiveKit fees. The calculator-default margin (55-70%) has no traceable LLM input: g4 prices.csv has no price for GPT 5 or 5.1, the 0.04/min models.

### Notes

VERIFICATION RECORD. The harness refused report.md and verify.md; the lane hit the same refusal. This text stands in for both. The per-claim record is in /home/user/sales-enabler/research/2026-10-20/teardown/retell/claims.json: every claim has a `verification` {status, note}, and changed claims keep `claim_lane` and `grade_lane`. /home/user/sales-enabler/research/2026-10-20/teardown/retell/predictions.json has a `verifier_check` per prediction; the pre-registered text is unchanged.

GRADES NOW: 67 claims, against the lane's 60. Observed 50 (lane 49), inferred 10 (lane 8), vendor-claimed 5 (lane 3), unknown 2 (lane 0).

METHOD (re-run, not trusted):
- Manifest: all 471 rows re-hashed, 0 mismatches, 0 unlisted files. 2 verifier rows added, so 473.
- DNS: 22 DoH lookups at 19:25Z (dns.google with 4 client subnets: Jio 49.36.0.0/24, 103.21.124.0/24, 8.8.8.0/24, AWS us-west-2 34.209.0.0/24; plus Cloudflare). Saved to data/teardown/retell/verify/dns-recheck/doh-ecs-recheck-2026-10-20.jsonl. IPs matched to AWS ip-ranges (createDate 2026-10-20-15-47-05); RDAP remarks read for the 3 LiveKit blocks.
- Pricing page: re-fetched 19:27Z. All 140 price strings and 19 telephony options identical to the lane's copy. The embedded demo bearer credential is redacted in our copy.
- pricing_allin.py: re-run, 324 rows, byte-identical. BYO 60-s row hand-checked (8.32).
- COGS: line items recomputed from g4 prices.csv.
- OpenAPI enums re-extracted: Language 63 (6 -IN), LLMModel 32, S2S 6, DisconnectionReason 39, PII 14; default timezone LA; default_country US; cross-midnight windows not allowed.
- Also re-read: SDK 3.0.2 source (gateway and livekit transports); npm times (80 retell-sdk releases since 04-20; client 3.0.0 on 09-08); HAR (Vercel 307s, auth.retellai.com behind Cloudflare, reCAPTCHA Enterprise); status incidents.json and both postmortems; threads t/1949, 758, 3145, 981, 842, 2363, 3723 and 3428; the docs DNC, KYC, billing, concurrency, compliance, contact-memory, ASR, language and purchase-number pages.
- Bounded negatives recounted word-bounded over llms-full (1,631,278 bytes).
- Not re-run: the HAR capture, the REA runs, the job board, Trustpilot, and the failure-mode threads t/2713, 2502, 384, 1645, 2856 and 2866.

CONFIRMED, unchanged (23): RET-05, 10, 12, 13, 15, 16, 17, 18, 20, 27, 29, 34, 38, 40, 42, 43, 44, 49, 54, 55, 57, 59, 60.
- RET-34 note: the marketing line 'No minimums' contradicts the 10-second rule.
- RET-38 note: 50 is the cap on Statuspage's incidents.json.
- RET-49 note: t/3723 is one unresolved thread; it does not show that UPI is refused.

CORRECTED, grade kept (14):
- RET-06: the OpenAPI DashboardSource enum lists 'campaign', so a Campaigns object exists server-side; its fields are still undocumented.
- RET-21: LiveKit's RDAP labels show the blocks the doc calls 'certain United States traffic' include Mumbai (143.223.91.0/24, 161.115.170.0/24) and Hyderabad (143.223.94.0/24) /24s.
- RET-23: 54.183.22.7 is an OpenAPI example value, not an observed gateway. The gateway keeps LiveKit's room and identity-token model, so its server software is unknown.
- RET-25: quote verbatim (2026-03-25, now seven months old). The us-west-1 'DNS' was an API example. The LiveKit Hyderabad edge contradicts 'no other PoP' for media edges.
- RET-26: iad1 is the Vercel edge nearest our sandbox, not the app's region.
- RET-32: the standard LLM column goes to 0.384 (GPT 6.1 Sol Ultrafast), not 0.32.
- RET-35: numbers reproduce. Four caveats added:
  - the transcript counts toward the 4,000 tokens, so the long-call rows are optimistic;
  - whether a BYO Indian trunk can reach a US SIP edge at domestic rates is unverified (t/981, REG-25);
  - the +1 path cannot carry BFSI service calls;
  - the figures are computed, not billed.
- RET-37: ratios fixed and the hosting reasoning removed.
- RET-39: about 6 h of undetected latent degradation, then 39 min from the 16:10 fleet-wide failure to the 16:49 post. On 09-16: paged after 7 min, public post after 35.
- RET-45: the docs contradict themselves; the international-call page says Retell 'also offers international numbers to purchase'.
- RET-46: BFSI post-sale needs 1600-series numbers.
- RET-47: split. Controls in the API stay observed; certifications and ZDR move to RET-47b as vendor-claimed.
- RET-48: IST hours depend on US daylight time: 21:30-09:30 until 2026-11-01, then 22:30-10:30.
- RET-58: 'there is no bandit' becomes 'none documented'.

ADDED (7):
- RET-22b (unknown): which framework the server-side runtime uses.
- RET-36b (unknown): the calculator-default margin.
- RET-47b (vendor-claimed): certifications.
- RET-61 (observed): geo-DNS for the LiveKit host.
- RET-62 (inferred): an Indian browser's media first lands on LiveKit's Hyderabad edge; Indian-trunk SIP media may land on LiveKit's Indian /24s, which a PCAP will show.
- RET-63 (observed): the AI-disclosure preset. The account phase found an API-created agent with no handbook_config.
- RET-64 (inferred): BFSI 1600 gap; the Retell +1 route is out for insurance renewals.

NOT RE-CHECKED (19), outside scope or already vendor-claimed: RET-01-04, 07-09, 11, 14, 19, 28, 30, 31, 41, 50-53, 56.

PREDICTIONS (falsifiability):
- RET-P01: partly. Sign-up was already done by Instinct before registration; score from dashboard login instead.
- RET-P02: yes. Persona verification uses one real person's ID per account, so it is the owner's call.
- RET-P03: partly. Wrong basis; also score handbook ai_disclosure.
- RET-P04: partly. Item (b) is near-unfalsifiable as worded; item (c) needs a rater rule.
- RET-P05: partly. The cross-midnight item is already documented.
- RET-P06: yes, but n is tiny.
- RET-P07: yes.
- RET-P08: yes. Export is dashboard-only.
- RET-P09: yes. Record the SDP media address from each PCAP.
- RET-P10: partly. Fix the number of turns before the run.
- RET-P11: partly. Needs a tolerance, and the transcript inflates the scaling factor.
- RET-P12: partly. Its second clause is already contradicted; run 4 dashboard-created and 4 API-created agents.

WHAT CHANGES THE CONCLUSIONS:
1. Decision 1: post-sale BFSI on Retell is different plumbing, not lighter plumbing, because of the 1600 rule.
2. Latency: the 'US-West only' media story is wrong for the legacy edge. It must be measured from PCAPs before VP claims an India latency advantage.
3. Retell's gross margin at its default stack is unknown.
4. Disclosure is a platform preset, but it is not set on API-created agents.

FILES CHANGED:
- /home/user/sales-enabler/research/2026-10-20/teardown/retell/claims.json
- /home/user/sales-enabler/research/2026-10-20/teardown/retell/predictions.json
- /home/user/sales-enabler/research/2026-10-20/teardown/retell/manifest.csv
- /home/user/sales-enabler/context/inbox/teardown-retell.json: 14 nodes (10 corrected, 4 new: retell-livekit-geo-edge, retell-bfsi-1600-gap, retell-ai-disclosure-preset, retell-verification), 29 edges (new ones to ledger.REG-10, ledger.REG-20 and decision.2026-10-17.beachhead-v2), 2 events. It passes the schema check without merging. The measurement node now says the figures are computed, not billed, and drops the unsupported margin.
- Raw re-checks under /home/user/sales-enabler/data/teardown/retell/verify/.
- Not touched: graph.json. Nothing was committed.

ACCOUNT-PHASE ADDITIONS:
- PCAP SDP media address on every Indian call.
- Disclosure on API-created vs dashboard-created agents.
- Whether a 1600 trunk can reach sip.retellai.com.
- Batch-path number parsing.
