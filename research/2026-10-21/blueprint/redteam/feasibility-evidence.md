# Red-team review: is the VP blueprint true and buildable?

**Lens:** feasibility and evidence. **Date:** 2026-10-21. **Grades:** [M] measured, [C] computed (here or in cited code), [O] observed, [V] vendor-claimed, [I] inferred, [U] unknown.

**What I checked.**
- The spine and all 9 modules, as relayed.
- `context/DIRECTION.md` and all 72 `rejected.*` graph nodes, plus selected `decision.*`, `risk.*` and `open.*` nodes.
- Research: the l6 power report, the SY18 cost table (`research/2026-10-18/SYNTHESIS.md` §2.1), and the l8 round-2 TTFT table (`research/2026-10-17/lanes/l8-azure-bench/round2/findings.md` §3.1).
- Code and harvest notes: `voicelab/server/catalog.py` and `docs/harvest/tx-voice.md` §6.2.
- Gates and pass bars: the KC table in `research/2026-10-17/SYNTHESIS-v2.md` and the W1-W10 bars in `research/2026-10-20/teardown/synthesis/where-we-win.json`.
- Every `data/blueprint/*-defaults.json`.

I used `data/blueprint/owner-requirements.json` instead of `owner-messages.md`, because the requirements catalogue (§7) says that file still holds unredacted credentials. No vendor was called and nothing was logged into.

## Verdict

**The blueprint is honest in its parts and over-committed as a whole.** Most module texts already label their own unknowns. They grade vendor claims correctly, avoid most rejected ideas by name, and keep safety in code.

Three things do not survive checking:
1. **There is no buildable v1.** "v1" is the whole platform across nine modules, with no critical path, team or date. That is the shape `rejected.harvest.19` warns against.
2. **The speed promise does not fit the owner's preferred voice.** The predicted gap is computed with a TTFT measured on a smaller prompt than brief v2.
3. **The first jobs and first design partners sit behind two unanswered gates.** KC5 (1600 numbers and AI streaming) and KC8 (whether a renewal reminder counts as solicitation) are both open.

Below these, the Base price margin, the all-in telephony invoice and several safety mechanisms rest on numbers that come from a different prompt, a different component or a different product.

## 1. Critical

**C1. v1 has no buildable first slice (`rejected.harvest.19`).**

v1 asks for all of the following at once:
- an 80-tool registry with CI parity, 10 card types and a hash-chained audit log;
- AEC, a turn manager with lexicons, 3 presets and reply-door rules R1-R11;
- AMD fingerprints, the full campaign state machine with canary, outbox and inbound continuity;
- 20 monitors, mission control and judge calibration;
- the company brain, forget with tombstones, and a 10,000-probe leak battery;
- GST/TDS invoicing, a Python voice-rt port, a TypeScript control plane, a 99.5% SLO with synthetic calls, and dual-carrier failover;
- Scout, and 11 screens at 2 widths in 2 themes.

Today the product has no code. The lab is paused (`decision.2026-10-20.pause-lab`), and Phase 0 waits on Vertex, counsel, buyer interviews and a listener panel. The harvest rejected exactly this: infrastructure and bookkeeping before one real signed-in journey.

**Smallest fix:** name a v0.5 vertical slice and gate everything else behind it. The slice covers:
- one non-BFSI service preset;
- one carrier (Plivo BYO) and one measured stack;
- browser call, then CSV, then one service campaign;
- the dial gate (window, suppression, budget), disclosure and crisis predicates;
- the call page with reason, cost and recording.

Exit the slice on W1, W2 and T5 with 3 design partners. Every other module item needs a named dependency on the slice.

**C2. The speed bar and the preferred voice cannot both hold, and the prediction is optimistic.**

The spine's Phase 0 gate is cut-ins of 5% or less at p50 1.2 s or less (server), plus 1.5 s at the handset. Several measured facts push against it:

- **The Natural preset misses it.** The owner's Gemini-voice stack measured 1.6-2.2 s server-side [M smoke, n about 3 replies, `research/2026-10-20/voicelab/round1-review-and-v2.md`].
- **The worked example uses the wrong TTFT.** The voice module predicts "≈1.86 s server" with gpt-4.1-mini at 304 ms. That 304 ms was measured on round 1's 1.6k-token prompt with a warm cache (l8 round2 §3.1, n=33). On the renewal brief the same deployment measured 641 ms (`catalog.py` line 27, n=6), and the round-1 review gives 567 ms. Substituting gives 2.13-2.20 s server and 2.4-2.7 s at the handset [C].
- **The claimed recovery to 1.2-1.4 s server has no measured path.** Even after the full leading-silence trim (0.36 s) and the speculative saving (0.224 s, measured only *with* early release, which is rejected: `rejected.2026-10-17.speculative-release`), the floor is about 1.54-1.62 s [C].
- **The economics budget can only be met by voices that failed the ear test.** Its handset budget (1,500 ms) needs brain 350 and voice 350. Only gpt-4.1-mini on the small prompt and Azure neural voices meet those, and Azure voices rated 1.5-4.5 by ear. gpt-4.1-mini also retires 2027-04-14.
- **Speed and cut-ins trade against each other.** The 450 ms endpoint budget assumes 300 ms segmentation. Measured: 500 ms segmentation cut in on 72% of 0.9-1.3 s pauses; 800 ms cut in on 17% (l8 round2 §4). The voice module's Standard preset uses 500 ms segmentation plus a 600 ms hold, so its numbers do not match the economics budget.

The blueprint says "the ear decides", but it never says which bar is relaxed when the ear picks a stack that misses 1.2 s. req-11 is a *must* ("latency has to be good").

**Smallest fix:**
- Recompute every predicted gap with TTFT measured on brief v2 plus ledger plus memory brief.
- Make speed and cut-ins one joint gate per preset.
- Record an owner decision: either Natural ships against a stated handset bar (for example p50 ≤ 2.0 s, cut-ins ≤ 10%) shown in product copy, or Natural is not the default until it measures at the bar.

**C3. The first jobs depend on KC5 and KC8.**
- Two of the four v1 presets (insurance renewal, lending pre-due) and the named first design partners need 1600xx numbers.
- KC5 is **at-risk** (`SYNTHESIS-v2.md` KC table):
  - no provider documents AI streaming on 1600;
  - no price is published;
  - Plivo requires a telemarketer registered in Mumbai or Karnataka;
  - provisioning takes 7-14 business days.
- KC8 (is a neutral renewal reminder solicitation?) is not yet tested, and IMFs may not use telemarketers (REG-29).
- If either fails, the first preset and the first partners disappear.

**Smallest fix:**
- Gate the insurance and lending presets on KC5 quotes (due about 2026-10-30) and on counsel (about 2026-11-13).
- Recruit at least one non-BFSI design partner (appointments or subscriptions on a declared 10-digit line) in parallel.
- Build no IRDAI pack before counsel answers.

## 2. Numbers that do not survive checking

**Price and margin.**
- The economics module's Base price of ₹3.49 shows 38% margin now and 28% in 2027. It uses the G-A point estimate of ₹1.56 AI per minute, the lean-persona composite in SY18 §2.1.
- SY18's own Monte Carlo with persona and light memory lifted the cheapest stack from 0.94 to 1.22 (×1.30). The G-A 2027 Monte Carlo p90 is 2.22.
- **Same uplift applied to G-A:**
  - COGS is about ₹2.57 now and ₹3.04 in 2027;
  - margin at ₹3.49 is about 24% and 11%, below the module's own 30% and 25% rule;
  - by that rule Base needs about ₹3.78 now and ₹4.16 for 2027 [C].
- **Fixed costs the per-minute COGS leaves out:**
  - the free ₹200/day test budget per workspace (about 95 free minutes a day, ₹6,000 a month);
  - the included Operator brain (fair use 200 turns/day at ₹0.48-0.60 each);
  - human support with a 2 h SLA in IST hours (W9);
  - synthetic monitoring (₹12k a month);
  - openings rendered during the ring on the 45-55% of dials that are never answered;
  - absorbed pulse rounding and auto-credited VP-fault calls.
- No invoice has been read.
- **Fix:** re-meter G-A on the India VM with brief v2, ledger and memory before printing any price. Add a per-workspace cost model. Keep Base "TBD" in the artifacts until then.

**Telephony on the invoice.**
- The spine promises one all-in INR price per connected second, telephony included, with the invoice within 1% of the rate card (W8/T7).
- But trust-telephony makes the carrier account the tenant's own. Under BYO the carrier bills the tenant directly, and whether VP may re-bill telephony is a counsel question (economics §2.1).
- So in v1, W8 measures two invoices, and the "all-in" price is a display, not a bill.
- **Fix:** v1 bills a platform rate equal to the all-in rate minus the metered carrier line, and shows the all-in figure. Restate W8 against the sum of both invoices.

**Self-learning.**
- **The 30-day target does not fit the L2 floor.** The learning target says "50%+ of L2 tenants with one proved change in 30 days". The L2 floor is about 43 connected calls a day. An opening test (686/arm) takes 32 days at that rate, and it may start only once shadow A/A holds the planned n on that metric. That makes about 60+ days at the floor [C]. Only turn-taking tests (70-163 calls/arm, ICC assumed) can plausibly prove something in 30 days.
- **The simulation probe is below its own noise floor.** It uses 18 personas × 3 seeds = 54 runs per arm, against the A/A floor of n ≥ 60 per arm (l6 L11). Its example contrast of "9/54 → 2/54, spread ±2" rests on one reference-vs-reference pair.
- **The budget is over-committed.** Two cycles a day at ₹100-200 each exceeds the ₹200/day test budget.
- **Ribbon flags carry no multiplicity control.** Flags across moments × segment chips × versions have none, and l6 L07 already allows up to 2.6% false flags per line.

**Fixes:**
- restate the target as 60-90 days, or as turn-taking only;
- raise probes to ≥60 runs per arm;
- apply FDR control across ribbon flags.

**Voice quality.**
- Brief v2 is measured on text only, with LLM judges and simulated callers. Agenda turns on Flash-Lite fell from 100% to 51% (`round1-review-and-v2.md`), and agenda *completion per call* was never measured.
- The ear bar of 7.0/10 was reached only by Gemini 3.1 Live (n=2), which shuts down 2026-11-17. Cascades rated 5.5-6.0.
- **Fix:**
  - Phase 0 measures agenda completion per simulated call against hidden keys alongside the round-2 ratings;
  - the blueprint states what ships if no cascade reaches 7.0.

**AEC.**
- The "0/66 echo false barge-ins, 12/12 true" figure is Azure Voice Live's preview reference-AEC, used as an "ear-only" service (api-version 2026-07-15). It was measured on a simulated loudspeaker harness, and its own notes say "nothing here is validated on real users or real phones" (`tx-voice.md` §6.2, line 306).
- In the same harness, end-of-turn p50 was 945-1,480 ms, and the turn detection stopped on Hindi continuers 23/36 times.
- VP's Natural ears are Gemini, and VP has no AEC of its own.
- **Fix:** either adopt Voice Live as the ear (and price its latency and preview risk), or build PSTN line-echo cancellation and test it on the Plivo leg with that harness. Do not cite 0/66 as VP evidence.

## 3. Regulation

The regulatory readings are mostly faithful to RS and SYNTHESIS-v2. The problems are gaps and conflicts between modules.

**The opening is specified three ways:**
- **Voice:** turn 1 is the name check; disclosure is "never the first words".
- **Trust RD1:** the "first breath carries the brand name, one AI clause".
- **Trust M6:** the recording notice goes in the second turn.

SYNTHESIS-v2 line 507 said "AI disclosure at the start of the call". Turn 2 then carries name, company, the AI clause, the useful fact, the reason for the call and the recording notice, which will break the 18-22 words-per-turn target.

**The disclosure test has no lawful control.** The Phase 0 gate ("disclosure may cost 5 points of hang-ups at most") needs a control, and an undisclosed live arm would break the standing rule.

**Fix:**
- One opening spec, owned by voice and checked by trust predicates.
- Restate the gate as a placement or wording A/B, or as the hazard at the disclosure moment against neighbouring moments. Detecting a 15% → 20% rise needs about 900 calls per arm.

**Dated items missing from the critical path:**
- **VP's own DLT principal-entity registration and its trial-CLI A2P declaration.** Every AI call is A2P (RS-08, due about 2026-11-17/18). Without these, the trial line (W7) cannot ring after that date.
- **The Plivo trial.** Credit expires 2026-11-16 and is capped at ₹80 a month, which limits the handset battery.

**Retention conflicts with the first preset.** Memory-omni defaults recordings to 90 days, while trust-telephony names a 10-year IRDAI minimum for intermediary call records. A sector pack must override the default, and the order of precedence is not written down.

## 4. Rejected ideas re-proposed without a supersedes edge

- **`rejected.2026-10-17.per-minute-launch`** is listed as "avoided" by economics, yet v1 launches per-second self-serve pricing. The scope changed from managed to self-serve, and that may justify reversing the rejection, but the graph has no reversal condition or supersedes edge for it.
- **`rejected.2026-10-17.parity-undercut`.** The public `/pricing` hero leads with ₹3.49 and a competitor chart, while design-language says "no price-led hero". The chart is rate-card arithmetic with no invoice behind it.
- **`rejected.2026-10-17.managed-telemarketer`.** "Per-outcome pricing for managed design partners" with VP-borne escalation brings back the managed operating model that IRDAI rules rule out.
- **`rejected.harvest.01`.** Premium Live is gated, which is right. But "transcript with *or before* audio" means each clause has to be buffered before the gate can pass it, and that removes Live's latency edge. Measure the lead-time distribution, not the count.
- **`rejected.harvest.15`.** The "say you are human" adversarial personas will hit Azure Prompt Shields if run on Azure. Frame them as a QA writing task.

**Fix:** add `supersedes` or `reverse_if` entries with their evidence, and remove price-led copy until T7 runs.

## 5. Failure modes that are missing or under-designed

- **Mid-call component failure.** "She closes politely" assumes TTS works. If TTS or STT is the part that failed, she can say nothing. Pre-render a hold clip and a close clip per voice at publish.
- **Correlated fallbacks.** A same-voice fallback is the same provider in another deployment, so a Google-wide outage has no same-voice route. Require a cross-provider declared alternate before production launch.
- **Quota.** Each call needs 13-25k TPM. Paid Vertex quotas are [U], and the production voice path sits on CarbonSettle's Google account (`risk.2026-10-20.carbonsettle-account-exposure`). Production needs a VP-owned GCP organisation and measured quotas at the target concurrency.
- **Capacity.**
  - Python asyncio voice-rt runs VAD, resampling and AEC per call. Calls per instance are unmeasured.
  - Workspace concurrency defaults run up to 100.
  - Neon's India region is [U].
  - Load testing, DR/backups (RPO/RTO) in India, and on-call runbooks are absent.
- **Spam labelling and pickup.**
  - Line health watches TRAI reg 21A barring.
  - It does not watch on-screen "Suspected Spam" or Truecaller crowd labels, which cut pickup on declared 10-digit lines (the non-BFSI presets).
  - Pickup on 1600 lines is unmeasured.
- **Onboarding dependencies.**
  - Post-call follow-through (the renewal link) needs DLT SMS header and template approval or a verified WhatsApp Business Account, which takes days.
  - Launch readiness does not list either.
- **The dial path.**
  - The tenant predial hook (800 ms in campaigns and trust, 1,500 ms in economics) runs "inside the claim transaction".
  - The precheck target is p95 ≤ 50 ms.
  - Holding row locks across external HTTP will throttle the dialer. Use reserve → veto → confirm.

## 6. Security and privacy gaps

- **In-call tool scoping.**
  - A caller can speak another person's policy or loan number and an HTTP lookup tool will fetch it.
  - Fix: bind tool arguments to the dialled contact's record keys and refuse caller-supplied identifiers.
- **SSRF.** Tenant-defined HTTP tools, predial and precall hooks and webhooks run from VP's servers and have no egress allowlist.
- **PII in the Operator.**
  - The Operator compile includes uploads, which means raw customer rows reach any chosen brain, including ones outside India.
  - That contradicts the Data steward's "never personal values".
  - Default to headers and value shapes, with redaction.
- **Inbound identity.**
  - Inbound memory keyed on caller ID, and callback continuity ("humne kal aapko renewal ke baare mein call kiya tha"), both disclose the relationship before identity is checked.
  - Caller ID is spoofable, and keying identity to it breaks HV law 15.
  - For lenders, disclosure to a third party is an RBI harsh practice.
  - Require a knowledge check before account detail or memory loads, use a generic opener, and keep the purpose off the verify page for lending.
- **Redaction.** Gating Aadhaar and card redaction on Verhoeff or Luhn checksums *lowers* recall on ASR output, because a misheard digit fails the checksum and the number leaks. Redact on context; use the checksum only to raise confidence.
- **Free-budget abuse.** The ₹200/day per workspace test budget on phone-OTP sign-up is a free-minutes source. Cap it globally and per verified phone.
- **Credentials.** `risk.2026-10-20.secrets-pasted` is unconfirmed (Plivo token, keys, passwords). It must close before any production build uses those accounts.

## 7. Cross-module drift (P7 applied to the blueprint itself)

| Item | Conflicting values |
|---|---|
| Cross-midnight service windows (campaigns) | Absolute quiet hours 22:00-07:00 (trust) |
| Trial rings per day | 5 (workspace screen) vs 20 per number (trust defaults) |
| API-key default cap | ₹2,000 (economics) vs ₹5,000 (trust) |
| Plivo pulse | 30 s (trust table) vs 60 s (`phone.py`) |
| Predial timeout | 800 ms vs 1,500 ms |
| Gemini 3.8 Live talk-over | 42% vs 20/51 |

**Fix:** one defaults registry, with a CI check that every module's JSON agrees.

## 8. Claims hygiene in the comparison tables

- **"Retell batch ignores DNC [O]".** This is contested: `open.2026-10-21.wt-retell-dnc-skip-claim`.
- **"Nobody owns the Hinglish phone call".** Sarvam held Hindi on 38/40 turns.
- **"VP still costs the buyer less per real call".** This is rate-card arithmetic, with VP's own price unmeasured.
- **Incumbent latencies.** These are US-vantage demo agents, while VP's targets are handset figures.
- **W3 cannot be computed as written.**
  - No India-hosted incumbent has been measured at a handset.
  - SquadStack cannot be trialled, and Sarvam's workspace key is missing.
  - The spine's 1.5 s handset bar and W3's "0.3 s below the best incumbent" are different bars.
  - Fix: use an absolute handset bar, and measure Bolna (then Sarvam) on the same handset.

## 9. What is sound

The following hold up against the evidence:
- one dial path inside the claim transaction;
- a reply door with deterministic predicates;
- outcomes classed as confirmed, not_executed or unknown;
- immutable versions and run manifests;
- the category-first window and series router;
- the stranger guard on number normalisation;
- preference-only quoted memory with tombstones;
- fixed-horizon statistics, shadow A/A, winner expiry and the "under-powered" state;
- the fast lane's computed behaviour, labelled with its assumed reference curve;
- the copy linter.

These are true to `rejected.harvest.03`, `.04`, `.05`, `.07`, `rejected.2026-10-17.k2-dashboards` and `.cross-tenant-pooling`, and to the measured laws. Keep them. Ship them first in the v0.5 slice rather than all at once.
