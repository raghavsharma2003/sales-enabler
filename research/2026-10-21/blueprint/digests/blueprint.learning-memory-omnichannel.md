# VP: self-learning, memory, personalisation and omni-channel data (design-grade digest)

Date 2026-10-21. Companion data: `data/blueprint/learning-memory-omnichannel.json`. Grades: **M** measured, **O** observed, **V** vendor-claimed, **I** inferred, **C** computed (this step or l6 code), **U** unknown. No vendor product was logged into and no vendor API was called. One public fetch was made: the google-research/harness2 README, repo page and arXiv 2610.14224 (abs + HTML).

## 0. Bottom line

1. **Memory is the v2 feature we can ship with confidence. Self-rewriting is not.** Per-contact memory needs one call, not a sample (l6 s.1, C). VP can truthfully say: "remembers every customer, shows where calls fail, proves the changes you approve." It cannot say "learns on its own from every call" below about 1,000 calls/day on one script (l6 s.10 owner action 4, C).
2. **The owner's "call 100 changes call 101" works if learning targets dense signals measured in code.** That means line hang-up hazard, early hang-up, cut-ins, reply gap and connect rate. It does not work on sparse business outcomes. A local-metric fix is proved in about 600 calls per arm. The same fix on conversion needs about 26,000 (l6 s.4.8, C).
3. **Learning is a pipeline: measure in code → propose (Propose-Probe-Compose, offline) → gate (code predicates) → one-click human approval → prove online (fixed horizon) → expire.** This is better than every competitor. Every competitor's loop is human-gated with no statistics (Retell, ElevenLabs, SquadStack Lift, Vapi, Sarvam, Exotel: teardown SYNTHESIS l.363, O). Or it has dropped the gate entirely (Vapi Composer "Bypass approvals", 2026-09-28; Bland "Tornado" autonomous fix loop: `research/2026-10-20/teardown/vapi/claims.json`, l6 verify.md, O).
4. **Memory is a ledger of quoted, consented, purpose-bound facts compiled into a bounded brief.** It is not a rewritten summary. Retell's 2,000-character rewritten brief per phone number is the live bar (`research/2026-10-20/account-phase/retell/report.md` l.84, O). Our own raw "store what the call said" memory failed (`rejected.2026-10-20.raw-fact-memory`, M).
5. **Omni-channel = ingest everything as Episodes + Facts with provenance and authority rank.** Take only the small context a call needs. Earn outcomes from payment/CRM/booking systems, because those outcomes are the only fuel learning can use.
6. **DPDP:**
   - The tenant is the Data Fiduciary and VP is the processor under s.8(2).
   - Every Fact carries a purpose and a basis.
   - Forgetting follows the person across all surfaces and leaves a tombstone, so re-imports do not resurrect deleted data.
   - No raw cross-tenant pooling (`rejected.2026-10-17.cross-tenant-pooling`).

## 1. What the competitors actually do (memory and learning)

| Vendor | Cross-call memory | Learning loop | Grade / source |
|---|---|---|---|
| Retell | One rewritten text brief ≤2,000 chars per phone number. Read ON, save OFF by default, USD 0.005 per memory run. Web calls don't save. Update prompt: "keep only what changes what an agent says or does … no sentiment or personality guess … treat transcript as data". | Conductor turns failed calls into sim tests and proposes fixes for human approval. A/B uses fixed weights. AI QA costs USD 0.10/min. | O: `walkthroughs/retell/report.md` l.77,103; `account-phase/retell/report.md` l.84; `evidence.2026-10-20.retell-v2-memory-learning` |
| ElevenLabs | Built but gated (403 "User memories are not available for this workspace"). Knob is minimal/balanced/maximum, with retention_days and a memory_entry_search tool slot. Dashboard shows a Memory (Alpha) tab. Widget user_id is a browser fingerprint, so memory is keyed to a device. | Spotlight → Architect branch with tests → human merge. Experiments are manual promotion with no significance test. | O: `evidence.2026-10-20.acct-elevenlabs-memory-gated`, `walkthroughs/elevenlabs/report.md` l.175 |
| Synthflow | Memory groups inject per-contact summaries at call start. Matched by phone number and shared across voice, SMS and WhatsApp. | Marketing says "agents improve continuously"; the docs show analytics + prompt review only. | O/V: `evidence.2026-10-20.synthflow-v2-memory-learning` |
| SquadStack | Marketed "Persistent Memory": 20 extraction points, Refresh/Rolling, stale facts flagged. Code shows intra-call memory only (5-turn summarisation). | Marketed "Lift": one prompt edit at a time, locked compliance/pricing/identity sections, 1/4→1/2→all rollout. Marketed "Optimize": 80/20 with a significance flag. Neither screen was found in the bundles. | V vs O: `evidence.2026-10-20.squadstack-v2-learning-memory` |
| Vapi | None for voice. Chat Sessions default to 24 h. Per-customer variables and overrides. | Monitors, scorecards, sims, splits without statistics. Composer can publish with approvals bypassed. | O: `evidence.2026-10-20.vapi-v2-loop` |
| Bolna | None (per-call variables, inbound lookup). | None. It already emits interruption counts, barge-in recovery, talk/listen time and dead air. | O: `evidence.2026-10-20.bolna-check-no-memory-no-loop` |
| Sarvam | Per-call variables + known-callers CSV. | Manual: goal breakdowns by voice, intro and hour. Evals at INR 2/run. | O: `account-phase/sarvam/report.md` l.41 |
| Exotel | "Unified memory layer" (CCDP) and "Kaizen" are marketing only. No memory object in the VoiceBot API. | Versions with rollback, A/B allocation, call ratings. An evaluator + recommender is in testing. | O/V: `evidence.2026-10-20.exotel-memory-marketing-gap` |

**What the column shows:**
- Cross-call memory is a delighter in the Kano draft (2Y/2P of 8; teardown SYNTHESIS l.300). Simulated-caller evals are performance-tier parity (5Y/3P, l.284).
- Nobody documents A/A, sample size, stopping rules or winner expiry (l6 s.8 gap 1, O).
- Nobody keys memory to an authenticated identity. They key it to a phone number (Retell, Synthflow) or a device fingerprint (ElevenLabs).
- Marketing runs ahead of the docs on memory and learning at Retell, Synthflow, Exotel and SquadStack (teardown SYNTHESIS l.364).

## 2. What can safely be learned, at which level, with what volume

Power numbers use two-sided α 0.05 and power 0.8 on connected calls. A dialled call at 50% connect doubles them. Rows marked C (this step) reuse l6's formula, which reproduces its 1,565 for 50→45.

| Target | Level | Signal (earned in code) | Calls needed | Method / gate | Grade |
|---|---|---|---|---|---|
| **Contact facts and preferences**: language, script, aap/tum, pace, stated best time, promised date, objections heard, opt-out | per contact | exact caller quote + episode id + span | 1 call | predicate gate. Opt-out and language auto-apply; the rest by proposal/review. **Live adherence test required.** | M: recall@8 73.9→95.7%, consolidation ~USD 0.0007/person/night (`docs/harvest/hp-main.md` l.217). The only live preference trial FAILED: stored Hindi, replied all English (`docs/harvest/hp-handoffs.md` l.36) |
| **Turn-taking parameters**: endpoint hold, interruption sensitivity, backchannels | per tenant segment; per contact pace later | cut-in and reply-gap events per turn | cut-in 25→18%: 540 turns/arm unclustered, ≈70–165 calls/arm at 8–12 turns/call and ICC 0.05–0.2 | fixed-horizon 2-arm; guardrail: reply gap must not rise | C (ICC assumed). Problem size M: 15–42% cut-ins on every stack (DIRECTION.md) |
| **Opening**: the "useful first" slot after the locked disclosure | per script | early hang-up <10 s from telephony + TTS clause timestamps | 15→10%: 686/arm. 15→12%: 2,036/arm | fixed horizon; disclosure is never a variant | C |
| **Line-level drop-off** (owner's "90 of 100 dropped after a line", req-34) | per script version | hang-up aligned to TTS clause timestamps, no LLM | 2× line flagged 19% / 67% / 94% at 100 / 500 / 1,000 calls, false flags ≤2.6%. A 1.5× line needs 5–10k. A fix is proved at ~592/arm on local hazard, vs 4,028 on completion and 25,963 on conversion | Bayesian flag P(hazard >1.25× curve) ≥ 0.99, then an L3 test | C (l6 s.4.8; verify weakened "hundreds" to "≥500"). A catastrophic line like the owner's 90/100 is visible within tens of calls (I) |
| **Best time to call** | per segment; per contact = stated preference + pickup prior | answered/connect events, no outcome delay | connect 50→55%: 1,565 dials/arm. 30→36%: 963 | Beta posterior per hour bucket **inside the legal window**, discounted for drift | C. Windows: promotional 10:00–21:00; RBI recovery 08:00–19:00 from 2027-01-01; service calls have no TRAI band (`regulation-segment/report.md` s.2.6, O) |
| **Objection handling** | per tenant | LLM clusters objections (proposal only). The variant is judged on "call continues past objection", then on outcome | ~600–1,200 calls/test on local metric | PPC offline, then L3 online | I (from l6 L3/L4) |
| **Brief / agenda wording** | per tenant | agenda-ledger completion, words/turn, question-ending rate, hang-up guard | sim lab first (A/A floor n ≥ 60/arm, l6 L11), then L3 | PPC + code gates | M precedent: brief v2 moved words/turn 33→20, question endings 62–76%→13–29%, abrupt hang-ups 17–40%→0 (DIRECTION.md) |
| **Voice per segment** | per segment, volume only | early hang-up, completion + human panel | effects likely tiny: TTS vendor choice moved intro hang-up only 87.9–90.3% over ~99,400 calls | listener panel + language match. **Dialect matching opt-in only.** | V (l6 L32). M: Bhojpuri-vs-Hindi LID 2/6. A number series maps to a licensed service area (LSA), not a dialect; MNP ~1.35%/month in Bihar (`l5-human-dialect/report.md` l.128–137) |
| **Business outcome**: renewal paid, promise-to-pay, site visit | per tenant cohort | CRM disposition, payment webhook, booking record | 20→22%: 6,510/arm. 20→25%: 1,094/arm. 10→11%: 14,751/arm | fixed horizon or always-valid. Thompson only from ≥ ~1,000 calls/day | C (l6 s.4.1) |

**Never learned (locked):**
- AI disclosure (once, lightly) and the recording notice;
- consent and opt-out handling;
- crisis lines (Tele-MANAS 14416, 112);
- identity;
- prices, offers, amounts and dates. These live in data, so a learned line cannot introduce a number that is not in the input (honesty provenance gate);
- the call-category promotion fence;
- every rule appended last (position is mechanism).

A learned variant only ever replaces a slot in the middle of the prompt (l6 s.6 guardrail 2).

**Who can learn what in month one** (l6 s.4.2 and verify, C on modelled volumes):
- At pilot volume (20% of steady state), 51–80% of buyers in insurance renewals, real estate, collections and fintech clear the ~1,200-call local test (31–80% if D2C is included).
- Only 36% (collections), 22% (insurance) and 3.5% (real estate) can detect a +10% relative **outcome** lift in month one.
- The product must therefore show **"under-powered: ~N more calls needed"** as a first-class state.

## 3. Methods

### 3.1 Evals and simulated callers (pre-deployment, parity floor)

**Parity status.** Shipped at Retell (Conductor), Vapi, ElevenLabs, Sarvam (INR 2/run), Gupshup, Cartesia, PolyAI and Ringg. Sold standalone by Coval and Hamming (`evidence.2026-10-20.radar-parity-additions`, I).

**VP's version:**
- **Simulated callers with hidden keys.** Personas carry a secret truth (e.g. "will pay on the 5th if asked about the late fee"). A judge *extracts* beliefs and code scores them against the key. A model never grades holistically.
- **Evidence for that rule:**
  - every LLM judge family we tested failed a 0.80 agreement bar; self-agreement 77.1%; slot-A bias 58–81% (l6 L10, M);
  - verify notes those failures were preference judging, not outcome extraction;
  - so measure extraction accuracy against CRM ground truth before using it (l6 verify item 8).
- **Label-noise cost.** At 90% accuracy, an LLM outcome label inflates the calls needed 1.8–2.4×. At 80% it inflates them 3.6–5.5×. A judge biased 3 points toward one variant "finds" it better in 57.5% of A/A tests (l6 L09, C).
- **Multi-call simulations test memory:**
  - recall of a promise;
  - language adherence on call 2;
  - an opt-out honoured on call 3.

  These form the live adherence test that the harvest trial shows we need.
- **Synthetic data only.** Simulated rows are shaped like the tenant's CSV contract, with fictional values.

### 3.2 Statistics as code (online)

- **A/A period per tenant.** The noise floor depends on the number of variants. With daily checks at P(best) ≥ 0.95, false winners by day 90 are ~4–14% at K=4, ~20–24% at K=3 and **52–62% at K=2**. K=2 is the baseline-vs-variant split every vendor ships (l6 verify item 4, C; `rejected.2026-10-17.k2-dashboards`). A naive daily z-test gives false winners in 16% of A/A tests by day 7 and 36–37% by day 90 (l6 L03, C).
- **Pre-registration.** Fix the metric, minimum n and stopping rule up front. Use a fixed horizon or always-valid inference (Johari et al., l6 L04).
- **Effect read-outs.** Report effects from a held-out split or adaptively weighted AIPW, never from the bandit's own sample means (Hadad et al., l6 L39).
- **Winners expire** after 60–90 days or on a drift alarm. When the best arm switched at day 60, plain Thompson still picked the old arm in 56% of runs on day 90. Discounted Thompson (γ 0.97/day) got the switch right in 98.5% of runs, and a 21-day window in 98.3%. Novelty variants were falsely declared in 82% of Thompson runs (l6 s.4.6, C).
- **Delayed outcomes add roughly their own length to every decision.** Use a validated leading indicator earned in code, e.g. "payment link opened" (l6 s.4.5, C).
- **Goodhart alarm.** A rewrite that keeps callers on the line without converting raised minutes per call 2.7% for zero gain. Hazard metrics *find* problems; outcomes *decide* (l6 s.4.8).

### 3.3 Bandits: only where volume allows

At +10% relative on a 20% outcome with K=4, Thompson sampling picks the correct variant with this probability (l6 s.4.3, C):

| Calls/day | Day 7 | Day 30 | Day 90 |
|---|---|---|---|
| 1,000 | 0.86 | 0.99 | — |
| 100 | 0.49 | 0.72 | 0.91 (only 29% of runs declare a winner by day 90) |

- At 1,000/day, regret is 0.9%. Thompson is the best regret minimiser at every volume.
- Top-two Thompson declares sooner but at 3–5× the regret.
- **Policy:** opt-in for tenants with ≥ ~1,000 calls/day on one script, outcome delay ≤ 7 days and A/A passed.
- Keep an exploration floor.
- Stop exploration if the early hang-up ratio per 10-digit CLI rises. TRAI reg 21A flags short calls with high recipient diversity: 5 flags in 10 days → KYC re-verification and a 15-day bar. 140, 1600 and 1601 are exempt (l6 L35, O via l1).

### 3.4 Pooling

- **One segment policy across tenants:** wrong winners for 48–55% of tenants when tenants differ (τ 0.2–0.4). Raw cross-tenant pooling is rejected (C, `rejected.2026-10-17.cross-tenant-pooling`).
- **Partial pooling:**
  - cut A/A false winners from ~21% to 2.5%;
  - costs regret when tenants differ (2.4% vs 1.3% when each tenant learns alone).
- **Segment priors (v1.5) require all of:**
  - aggregate counts only;
  - ≥10 opted-in tenants;
  - ≥ ~3,000 calls/day combined;
  - small estimated τ;
  - a contract clause from each tenant;
  - never WhatsApp platform data (Meta terms s.4.7).
- **Owner's "learn from groups of users" (req-33)** is honoured this way: as consented aggregates and an invariant-lessons library, not pooled transcripts.

## 4. harness2 and how it maps onto a calling agent

### 4.1 What harness2 is

Read 2026-10-21: README, repo page and arXiv 2610.14224 v1 (submitted 2026-10-09; Xu, Chen, … Lee, Pfister); Apache-2.0.

**Core idea.** The model's weights stay fixed. What is optimised is the *harness*, made of eight editable components:
- context construction: system prompt, guardrails, memory, skills;
- tool interface: tool guidance, scripts;
- delegation: subagents;
- middleware: plugins.

**Task-level recursion (Propose-Probe-Compose):**
- **Reference.** Run the current harness on the task. The reference shows behaviour, not correctness.
- **Propose.** An editor (Claude Opus 4.8 under OpenCode in the paper) writes two candidates:
  - an *invariant* candidate fixing agent-level weaknesses that recur across domains (planning, tool use, context, delegation);
  - a *domain* candidate fixing knowledge, procedures and constraints.
  - Reused library components must be checked against current-task evidence.
- **Probe.** Run each candidate on the *same* task under matched settings. Compare its trajectory and deliverable with the reference, giving a *behavioural contrast*: fixed, unchanged or regressed. There is no ground-truth verifier.
- **Compose.** A composer merges supported edits, revises conflicts, adopts one candidate or keeps the current harness. **Each decision must cite a concrete observation**, not a presumed score gain.
- **Scaling.** Parallel recursion uses k references, k+k candidates and k compositions, plus an agentic selector over anonymised deliverables. Sequential recursion chains k steps.

**Harnessing-level recursion.** An experience reflector writes lessons to a persistent library. Each entry is an executable harness plus an EXPERIENCE.md (situation, lessons, evidence). **A lesson is kept only if execution contrasts support it**; weak evidence adds nothing. Later tasks start from the base harness H₀ and pull library entries on demand.

**Results** (paper, V for us since it is not our measurement):
- One step: up to +11.5 (WorkBuddy), +4.5 (JobBench), +11.8 pp (LAB partial).
- Parallel recursion at k=5 adds a further 2.6–6.7.
- Ablations at k=1, WorkBuddy / JobBench:

| Removed | WorkBuddy | JobBench |
|---|---|---|
| Library | −3.1 | −1.8 |
| Scoping | −2.9 | −3.7 |
| Composition | −1.6 | −1.9 |

**Limits it reports:**
- Contrast evidence is noisy and can reflect shared model bias. It is not a correctness check.
- Gains are not monotonic in k.
- Nine regressions fall into three groups:
  - poor selection (one case dropped 54→26);
  - propagated false premises (−2 to −11);
  - noisy outcomes.
- More k costs more compute.
- **No human-in-the-loop is discussed.** The improver is barred from seeing rubrics or graders. Invalid harnesses retry once, then fall back.
- Always-on prose costs context every run, while skills, subagents and scripts cost little until invoked.

### 4.2 Component mapping for VP's calling agent

| harness2 component | VP equivalent | Editable by learning? |
|---|---|---|
| system prompt | brief v2 shape (persona register, agenda ledger, "useful first" slot) | middle slots only, in shapes not lines (law: sentence-shaped text gets recited) |
| guardrails | locked sections + code predicates: disclosure, crisis lines, opt-out, category/promotion fence, hang-up guard | **never**. The composer's diff on these must be empty, checked in code |
| memory | compiled contact-memory slot (bounded, whole entries, source ids) | the *compiler policy* (which facts, order, budget), not facts themselves |
| tool guidance | when to look up policy/payment; talk-while-waiting fillers in the caller's register | yes |
| subagents | post-call extractor, objection clusterer, compliance classifier, summariser | yes (offline) |
| skills | on-demand packs: objection, segment and language/register packs | yes. Preferred over always-on prose because they cost nothing until loaded, which protects the latency and prompt budget |
| scripts | deterministic code: date and EMI maths, window engine, Indian number formatting | yes, with tests |
| plugins / middleware | turn-taking: endpointing ms, interruption sensitivity, backchannels, silence nudges | yes (numeric parameters, the densest learnable signal) |

### 4.3 VP's loop (Propose-Probe-Compose made safe for production)

1. **Trigger (code).** Line-hazard flag, a cut-in spike, a tool-error cluster, a language-adherence miss, or an operator's "this call went badly".
2. **Reference.** Replay the published version against a failure set of simulated callers. They reproduce the failing pattern with synthetic data and matched seeds. Run **repeats** (paper: single runs are noise; ours: A/A floor n ≥ 60/arm).
3. **Propose.** An invariant candidate (conversation craft: turn length, question endings, repair, pacing) plus a domain candidate (the tenant's product facts and objections).
4. **Probe.** Contrasts are **measured in code**, not judged:
   - words/turn and question-ending rate;
   - cut-ins and reply gap;
   - agenda-ledger completion;
   - disclosure adherence and language adherence;
   - hidden-key belief extraction.
5. **Compose.** Every merge decision cites an observation id. Add a "shared assumption probe" to catch the paper's propagated-false-premise failure.
6. **Gates (throw, never warn):**
   - one `compile()`;
   - shape lint against recitable sentences;
   - prompt budget throws;
   - locked-section diff = ∅;
   - provenance gate (no new number, price or identifier);
   - India-measured latency within budget.
7. **Human approval.** One click on a card showing the diff, the contrasts and the predicted calls needed to prove it. Never "Bypass approvals" (Vapi) and never autonomous fix loops (Bland Tornado).
8. **Prove online.** L3 fixed-horizon test on the local metric (~1,200 calls), or L4 on outcome when n allows. Guardrail metrics auto-stop.
9. **Expire.** Re-test after 60–90 days or on drift.
10. **Library (harnessing-level).**
    - A per-tenant library holds adopted versions plus EXPERIENCE notes with evidence. Proposals reuse it, following the paper's library ablation (−1.8 to −3.1 without it).
    - A VP-wide **invariant-lessons** library holds conversation-craft lessons built from synthetic simulations and opted-in aggregates. It contains **no personal data**, so deletion never forces a relearn.

**Key difference from the paper.** harness2 has no ground truth, so it trusts contrasts. VP has production outcomes earned in code. So PPC is VP's *proposal engine*, and statistics on real calls are the *proof*.

## 5. Guardrails and approval (summary)

1. **A learned line is just a new prompt version.** It passes through the same gates as any human edit.
2. **Outcomes are earned in code.** LLM labels are advisory until their accuracy is measured, and then carry an inflation factor. Judges never see the variant id.
3. **Approval:** every change to a live agent needs a human click, recorded as one auditable row.
4. **Contact memory is the exception: data about one person, not a policy change.** It still has tiers:
   - opt-out applies immediately by predicate;
   - language, pace and register auto-apply from an exact quote, with undo;
   - commitments, financial facts and corrections need review.
5. **Auto-stop guardrails**, each counted by a writer that has been read back:
   - opt-outs and complaints;
   - AI-identity questions and disclosure adherence;
   - early hang-up ratio per CLI (reg 21A);
   - minutes rising without an outcome change;
   - barge-in and ASR-empty rates. Harvest: 5/14 empty ASR results on short answers like "haan"/"ok".
6. **No fine-tuning or RL on outcomes, and no autonomous online rewriting (L8).** The Darwin Gödel Machine removed the markers its own hallucination check used (l6 L18).
7. **Pricing.** Wherever a learner optimises anything correlated with minutes, price per outcome or per seat (l6 guardrail 8; `rejected.2026-10-17.per-minute-launch`).

## 6. Personalisation and memory data model

**Identity rule (inherited law): identity is an authenticated id, never a device or channel handle.**
- A phone number is an *identifier* of a Contact, not the Contact.
- A WhatsApp or Telegram sender is a channel participant until linked by exact match and review (`docs/channel-agents-v7.md`).
- Retell stores "9000000001" as +19000000001 and keeps "+919000000003" and "09000000003" as two contacts (`measure.2026-10-20.acct-retell-contact-number-handling`, M). VP uses India-default E.164 with cross-format dedupe (`decision.2026-10-20.acct-synthesis-vp-data-model`).

**Entities:**

- **Contact**: tenant_id, contact_id, display name, identity_verified, created_from (source receipt).
- **Identifier**: contact_id, kind (phone / email / crm_id / wa_id / policy_no), normalised value, verified, source.
- **ConsentRecord** (append-only ledger):
  - fields: purpose, basis, channel, evidence (artifact + quote/span or form id), captured_at, expires_at, withdrawn_at, notice_version;
  - basis is one of DPDP s.7(a) legitimate use, s.6 consent, TRAI inquiry (7 d), application (3 m) or contract (inferred consent).
- **Suppression**: tenant-wide opt-out / DND / do-not-contact with reason and source. It is never cleared by import (`docs/data-intake-v7.md`: deny flags preserved).
- **Episode** (immutable): a call, chat, WhatsApp or email exchange.
  - transcript and recording ref, agent version, campaign, category, retention class;
  - **citation ground truth for every fact**.
- **Fact**:
  - contact_id;
  - type: preference / commitment / objection / stated_fact / correction / opt_out;
  - value, plus **exact caller quote + episode_id + char span**;
  - source class: caller-said / CRM / operator / system; authority rank;
  - observed_at, expires_at, purpose, consent_record_id;
  - status: proposed / approved / superseded / revoked; supersedes.
  - **Never stored:** the agent's own claims, the brief's facts, mood, personality or trust scores (`decision.2026-10-20.preference-only-memory`; Retell's own prompt agrees, O).
  - **Contradictions become new rows**, never overwrites.
- **PreferenceView** (derived): language, script, register (aap default, never earned by repetition: `docs/relational-source-port.md`), pace, preferred window, channel.
- **Commitment**: who promised what by when.
  - Company-side commitments need approval.
  - A commitment is not evidence the AI promised or completed it (`docs/relationship-runtime-v2.md`).
- **Attempt**: dial result, CLI/series, ring time, hang-up timestamp, clause index at hang-up. This feeds line hazard and best time to call.
- **Outcome**: code-earned (payment webhook, CRM disposition, booking), with delay and a leading indicator.
- **MemoryBrief** (compiled per call, never stored as truth):
  - only approved facts whose **purpose matches the campaign's purpose**;
  - newest supported preference wins; whole entries only;
  - capped budget (our relational context cap is 3,600 chars; Retell's is 2,000);
  - placed in a middle slot;
  - a throwing budget gate.
- **ExperimentVersion / Lesson**: version diff, contrasts, approval row, test registration, expiry.
- **Tombstone**: hashed identifiers of erased people, so a re-import or CRM sync cannot resurrect them.

**Where each design rule comes from:**
- **Write path.** The post-call extractor proposes Facts that must cite an exact caller quote. The commit re-checks the quote and source in the same transaction (`docs/learning-source-port.md`, implemented offline-tested, O).
- **Refusal guard.** A deterministic guard stops "no follow-up please" from creating a follow-up.
- **Anonymous or unverified channel senders** produce feedback only, never memory (`docs/learning-automation-v7.md`).
- **Consolidation follows Meera's episodic design:**
  - episodes as ground truth;
  - index-only citations;
  - a 5% second-family entailment audit that halts above 2% refutation;
  - forget with suppression.

  The production cost is about USD 0.0007 per person per night (`docs/harvest/SYNTHESIS.md` l.240, M in its source product).
- **Recall.** Semantic + keyword legs run in parallel (DB scan 40 ms p50 vs embedding 305 ms). Lexical alone failed 0/27 adversarial cases (harvest l.109, M). The current VP brain port is keyword-only (`docs/brain-recall-source-port.md`), so semantic recall over memory is still to build.
- **Kill criteria** (`decision.2026-10-19.tier-plus`): recall across repeat calls below 95%, stored preferences ignored more than 1 in 20, or the memory prompt pushing p50 above 1.2 s from India.

**What the client sees:**
- a contact timeline across channels;
- each fact with its quote, and a play-from-here link to the recording;
- edit and forget buttons;
- the consent ledger;
- "what she will remember" settings in the copilot ("which fields personalise the call, what should she remember": walkthrough SYNTHESIS l.83).

## 7. Omni-channel ingestion: what to take from each

**Principle (l4c H8).** Customer-specific context does lift outcomes, but the evidence is moderate and none of it is from voice AI. Examples:
- goal-specific reminders +16% savings vs none; generic reminders had no significant effect;
- the recipient's name in an email subject line +31% leads;
- a two-way bank-agent call +34.4 pp timely repayment (LATE, n=3,448).

A renewal call needs only:
- name, policy, insurer, premium, due date;
- language;
- the last interaction;
- consent.

Buyers already hold this in spreadsheets or a CRM, so VP plugs in rather than becoming the CRM (the command centre is the expansion path).

| Source | What is useful | How / caveats | Grade |
|---|---|---|---|
| **CSV / Google Sheet** | name, phone, policy/loan id, product, amount, due date, language, last interaction, deny flags | AI mapping proposal + per-column review. Exact-match identity, **no fuzzy merge**. Deny flags never cleared. Reject (never truncate) oversized input. Today's port caps at 1,000 rows/source; production must lift this with the same guarantees | O (`docs/data-intake-v7.md`); I for scale |
| **CRM** (LeadSquared, Zoho, Kylas, Salesforce; Sell.Do in real estate) | contact fields, stage, owner, last activity; **new-lead webhook** (speed-to-lead; Sell.Do claims an 11 s median response, V); **write-back of disposition and outcome** | every field carries a DataAuthorityClaim (source, authority rank, observed time, max age). A higher-authority fresh value wins; equal-authority conflicts go to review (`docs/integration-contracts.md`). Integration failures are 17% of incumbent complaints (l4c, M on n=111) | I / O |
| **Telephony and past calls** (dialler exports, recordings) | attempt history, hang-up timestamps, dispositions → hazard priors, best time, objection corpus | purpose limitation on old recordings. l6 owner action 2: an anonymised dialler export replaces the assumed hazard curve | I |
| **WhatsApp** | inbound questions, stated preferences, payment-link clicks, in the 24 h service window | **Meta s.4.7: platform data may not train or improve AI except a model for that business's exclusive use**. No templates to cold numbers (`rejected.harvest.08`). WhatsApp calling needs permission: 7-day temporary permission, ≤2 requests per 7 days, revoked after 4 unanswered, 100 connected/24 h per number (Interakt, O) | O |
| **SMS** | delivery and click events; DLT template ids; the post-call DPDP Rule 3 notice link | category-correct templates | I |
| **Email** | replies and written commitments as Episodes (EML ingest exists) | exact-quote extraction | O (`docs/ingestion-source-port.md`) |
| **Web / app events** (req-31) | the one recent action that makes the opener useful ("stopped at KYC step 3") | consent-checked, purpose-bound; never tracking pixels on a cold first touch (`rejected.harvest.08`) | I |
| **Payment systems** | paid / failed / **link opened** (a leading indicator for delayed outcomes); due amount | **the** code-earned outcome. Amounts are spoken only from data (provenance gate) | I (l6 s.4.5) |
| **Policy / loan admin systems** | policy number, expiry, premium, NCB, EMI schedule | highest authority rank. IRDAI: records in India, ≥10 years | O (l1 r2 l.310–311) |
| **Company docs / website** | offers, FAQs, procedures → company brain | grounded recall with exact-quote citations. **Separate from contact memory**; personal records are flagged and cannot become company knowledge | O (`docs/brain-recall-source-port.md`, `ingestion-source-port.md`) |

**"Fire an agent on any data" (req-28):**
1. Any upload or connector becomes immutable source receipts.
2. Mapping happens with review.
3. Contacts and Facts are created with provenance.
4. The copilot proposes an audience + campaign, with the call category first. Category derives the window and series, and suppression is applied.
5. One approval launches it.

**The LLM-driven part:**
- The copilot reads the source, explains what it found ("312 rows, 14 missing due dates, 9 opted-out rows kept suppressed") and asks only the questions that change the call.
- It never decides identity merges or consent on its own.

## 8. DPDP consent, retention and deletion

- **Roles.**
  - The tenant is the Data Fiduciary; VP is the processor under an s.8(2) contract.
  - Rule 6 requires logs, one-year retention for breach investigation, and safeguards in the processor contract (`regulation-segment/report.md` RS-29, O).
  - VP's DPA and audit trail are part of the product. VP is probably not a TCCCPR "Sender", but "caused the call" is a counsel question (I).
- **Dates.**
  - DPDP Rules Gazette 2025-11-13.
  - Rule 4 (consent managers) from ~2026-11-13.
  - Core obligations from ~2027-05-13 (RS-27, O).
  - Penalties up to ₹250 cr / ₹200 cr / ₹50 cr (l1, O).
- **Basis per purpose:**
  - Post-sale service calls: s.7(a) "voluntarily provided for a specified purpose" covers calling a customer about what she bought (RS-32). TCCCPR inferred consent lasts for the contract (RS-12).
  - Pre-sale: an inquiry gives 7 days, an application 3 months (RS-12). DND numbers need consent registered in the operators' Consent Register (CRF), which only 11 pilot banks can upload today (RS-13).
  - Bought lists need DPDP consent from ~2027-05-13.
  - TCCCPR exempts no one from DPDP; the two regimes stack (RS-14).
  - Children's data needs verifiable parental consent (l1 row 15).
- **Notice.**
  - Rule 3: self-contained, itemised, with a link to withdraw, exercise rights and complain (RS-28).
  - In-call pattern: announce the recording, give the purpose in one sentence, then send the Rule 3 link by SMS/WhatsApp afterwards (I).
  - IT Rules 2026: synthetic audio needs a prominently prefixed disclosure and provenance metadata (l1 row 18).
- **Memory and purpose (I, counsel).**
  - Personalising the *next service call* from the *same relationship* plausibly sits inside the original purpose.
  - Using service-call memory for cross-sell is a new purpose: it needs consent and turns the call promotional.
  - Hence `Fact.purpose` and purpose-matched compile.
- **Retention classes:**
  - recordings: RBI recovery 6 months; otherwise tenant-set with notice;
  - transcripts and facts: until the purpose ends (s.8(7)), with sector overrides (IRDAI ≥10 years, in India);
  - logs: 1 year;
  - aggregates: counts only.
  - The IRDAI 10-year vs DPDP storage-limitation conflict is an open counsel question (l1 r2 l.488).
- **Deletion:**
  - **forget follows the person** across voice, WhatsApp, email and CRM-linked records (harvest "forget-follows-the-person", 39/39 live, M in source product);
  - recompute briefs; write a Tombstone + suppression so syncs cannot resurrect the person;
  - lessons and aggregates hold no personal data, so no retraining is needed (another reason for no fine-tuning).
  - Deletion is triggered only by verified human intent checked in code, never by a model-emitted marker (44 rows were lost that way: `rejected.harvest.04`).
- **Residency.** DPDP has no general localisation (RS-30), but IRDAI records stay in India. Default India region.
- **Cross-tenant.** No pooling of personal data. Aggregates only, under contract (lawyer questions in l6 s.10).
- **Our own house rule:** synthetic data only in tests and simulations.

## 9. Product surfaces (how the client experiences learning)

- **Learning inbox.** Proposal cards show the problem found (e.g. line 4 hang-up hazard 2.1×, CI shown), the proposed diff, the simulated contrasts, a predicted "calls to prove", and Approve / Reject.
- **Experiments page:**
  - a power meter;
  - A/A status;
  - pre-registered metric;
  - an **"under-powered"** verdict;
  - an expiry date;
  - effects with intervals, never raw bandit means.
- **Campaign view.** Line-hazard ribbon over the script; best-time heatmap inside legal windows; per-contact timeline.
- **"How she changed for you" timeline (req-27).** Each adopted version with its measured delta, so the owner sees improvement over time honestly.
- **Tiering (req-36).**
  - Base: human voice + per-call personalisation.
  - Plus: memory + learning inbox.
  - Premium: bandits and segment priors.
  - The memory cost is shown at its toggle (Retell's pattern).

## 10. Not verified / open

- **Turn-taking clustering.** The ICC is assumed; it needs real per-turn data.
- **Effect sizes.** Real Indian hazard curves and line-level effect sizes are U (l6 s.11). One anonymised dialler export would answer them.
- **Memory adherence on our stack.** No live multi-call memory test has run.
- **LLM extraction accuracy** against CRM ground truth has not been measured.
- **harness2 on dialogue.** It is untested on voice or dialogue. Its benchmarks are document and code tasks with fixed weights, and there are no production deployment numbers.
- **Counsel questions:**
  - processor aggregates under s.8(2);
  - reg 21A exposure from exploration;
  - memory purpose scope;
  - the IRDAI vs DPDP retention conflict.
- **Competitor timing.** ElevenLabs memory and campaigns could go live within a quarter (`risk.2026-10-20.elevenlabs-campaigns-and-price`).
