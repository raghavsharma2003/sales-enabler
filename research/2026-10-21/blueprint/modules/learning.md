# Module: the self-learning system (id: learning)

**Status.** Proposed blueprint for owner review, 2026-10-21 (`directive.2026-10-21.blueprint-end-to-end`). **Grades:** [M] measured by us, [C] computed, [O] observed, [V] vendor-claimed, [I] inferred, [U] unknown. **Defaults and computed tables:** `data/blueprint/learning-module-defaults.json` (written by this step; seeded computation, reference hazard curve and ICC assumed). **Short paths:** L6 = `research/2026-10-17/lanes/l6-self-learning/report.md`; L6V = its `verify.md`; LMO = `data/blueprint/learning-memory-omnichannel.json`; VMD = `data/blueprint/voice-module-defaults.json`; IMD = `data/blueprint/intelligence-module.json`; WTR = `data/blueprint/workspace-tool-registry.json`; TC-x = `research/2026-10-20/teardown/x/claims.json`.

## 0. The module in one breath

VP gets better from its own calls the way a good team lead does. It counts every call in code, notices exactly where people leave or stumble, drafts a fix and tries it on simulated Hinglish callers, asks you once, proves the fix on real calls with honest arithmetic, and retires winners that stop being true. Two things update on every single call: the person's memory (call 101 to the same customer is better at once, owned by memory-omni) and the moment-level counts (a catastrophic line is caught within tens of calls). Everything slower is proved, never asserted.

**Promise (copy rule):** "Remembers every customer, shows where calls fail, proves the changes you approve." **Never below volume:** "learns on its own" (L6 §1, §10.4).

## 1. Benchmark: the best per sub-area, and where each falls short

| Sub-area | Best today | Their best version | Where it falls short |
|---|---|---|---|
| Finding where calls fail | Vapi Monitoring: issues with severity, MTTR, calls impacted, a Compliance category [O, TC-vapi VAP-61]; SquadStack Lift claims near-miss and early drop-off mining [V, SQS-64] | Issue inbox from monitors | No vendor computes a per-line hang-up hazard with an interval. Labels come from LLM post-call extraction, which at 90% accuracy needs 1.8-2.4x more calls [C, L6 L09]. Vapi says "Great news! no active issues" with zero monitors on [O, wt-vapi-37] |
| Drafting the fix | Retell Conductor: failed calls become simulation tests; per-setting diffs a human accepts; "70% of Retell's own simulation testing" [O RET-03, RET-58; V] | Diff plus simulation | The only metric is the test pass rate (L6V item 7). No locked-section or provenance check. Credits cost USD 0.20 each after 30 a day [O RET-03] |
| Testing before live | ElevenLabs persona tests with success conditions and repeat runs [O EL account report §1]; Vapi simulations with latency expectations [O AP-17]; Synthflow Test Center reruns after every change [O] | Persona simulations | Holistic pass/fail by a model, no hidden keys scored in code, no measured simulation noise floor, English-first personas, no multi-call memory tests |
| Approval and locked parts | ElevenLabs branch, then a merge proposal a person merges [O EL-03]; SquadStack Lift locks compliance, product rules, pricing and identity [V SQS-64; no screen in bundles, O SQS-65] | Human gate | Vapi Composer "Bypass approvals" can publish without pausing [O VAP-61]; Bland Tornado "applies fixes, and retests until all scenarios pass" with no approval documented [O, L6V item 7]. Nobody checks a locked section in code |
| Online experiments | SquadStack Optimize: 80/20 or 70/30 splits with a significance flag [V SQS-65]; Retell weighted agent lists, Vapi % splits, ElevenLabs deterministic split, Bland quotas [O RET-08, L6V item 7] | Traffic split | None documents A/A, sample size, stopping rule or winner expiry [O L6 §8]. A daily-checked two-arm "winner at 95%" view gives 52-62% false winners in A/A by day 90 [C L6V item 4; `rejected.2026-10-17.k2-dashboards`] |
| Rollout | SquadStack Lift: a slice, then a quarter, half, all [V] | Staged ramp | Not seen in product; no vendor documents a guardrail auto-stop |
| Improvement over time (req-27) | Retell: filter analytics by agent version [O RET-08] | Per-version filter | Nobody shows a change history with effects and intervals. Synthflow says "agents improve continuously" while its docs show analytics only [O SYN-81]; Exotel's "Kaizen" is in no doc [O `evidence.2026-10-20.exotel-memory-marketing-gap`] |
| Learning from groups (req-33) | SquadStack claims learning across "400 million+" interactions [V, L6 §8.4] | Pooled corpus | One pooled policy gave the wrong winner to 48-55% of dissimilar tenants [C L6 §4.7]; DPDP s.8(2) and Meta s.4.7 limit pooling (`rejected.2026-10-17.cross-tenant-pooling`) |
| Lesson library | harness2: executable harness plus EXPERIENCE note, kept only on contrast evidence; removing it costs 1.8-3.1 points [V, arXiv 2610.14224, LMO §4.1] | Library | No vendor ships one. harness2 has no human gate, no production numbers, and was measured on document tasks |
| Turn-taking tuning | Retell per-node responsiveness and interruption overrides [O RAP-18]; ElevenLabs eagerness enum [O] | Manual knobs | No vendor measures cut-ins per version or tests a knob; 0 of 6 dashboards show a predicted reply gap [O, walkthroughs SYNTHESIS] |
| Cost of the loop | ElevenLabs Architect free "through October 2026" [O EL-03]; Sarvam evals INR 2 a run [O, account-phase sarvam report l.41]; Retell AI QA USD 0.10/min (INR 9.5) [O RET-58] | - | Metered per message or per minute; price after alpha unknown |
| Memory that feeds learning | Retell: one rewritten brief of 2,000 characters or fewer per phone number, saving off [O]; Synthflow: per-contact summaries across voice, SMS, WhatsApp [O SYN-80] | Contact brief | Keyed to a phone number or a device. SquadStack's Persistent Memory is intra-call in code [O SQS-74]; Bolna, Vapi and Sarvam have none [O] |

**Bottom line.** Every shipped loop is human-started, human-merged and has no statistics. The two loops that remove the human (Vapi Bypass, Bland Tornado) also remove the guard. No vendor tells a client how many calls a claim needs. VP fills exactly that gap, and adopts the best parts: Conductor's failed-call-to-test, ElevenLabs' branch and merge, Lift's locked sections and staged ramp, Vapi's issue model.

## 2. What VP learns, at which level, with what volume

| Target | Lives in | Decision metric (code) | Calls to prove [C] | Phase |
|---|---|---|---|---|
| Turn-taking numbers (hold ms, barge-in ms, segmentation, continuer timing, rate 0.9-1.1) | Stack turn policy / preset (VMD turn_presets) | Cut-in rate from stereo channels; guardrail reply gap +150 ms non-inferior | 25%->18%: 540 turns/arm unclustered, **70-163 calls/arm** at 8-12 turns and ICC 0.05-0.2 (ICC assumed) | v2 |
| Lexicons: Hindi/Hinglish backchannels, continuation words, stop terms | Ledger pack and turn lexicons | Short-reply-kept rate, cut-ins; offline ledger keys (precision 0.95, recall 0.9) | Offline first, then as above | v2 |
| OPENING: the useful-first shape after the locked disclosure | Brief OPENING slot | Early hang-up under 10 s | 15%->10%: **686/arm**; 15%->12%: 2,036/arm | v2 |
| A moment's shape in a middle slot (the owner's call 100 -> 101) | Brief CORE / SITUATION_GOAL | Local hazard at the moment, then agenda milestone | Catastrophic: flagged at **median call 13-15** (§4). Ordinary fix: **~592 calls/arm** on local hazard vs 4,028 on completion vs 25,963 on conversion (L6 §4.8) | v1 fast lane; v2 tests |
| Objection packs (skills loaded on demand) | Skill pack | Call continues 2+ turns past the objection and reaches the next ledger milestone | 50%->60%: 388/arm of calls that hit the objection | v2 |
| Tool guidance, talk-while-waiting shapes | Tool guidance | Dead air and hang-ups during tool waits | ~400-700/arm [I] | v2 |
| Best time inside the category window | Campaign pacing weights; per contact = stated time + pickup prior | Connect rate | 50%->55%: 1,565 dials/arm; 30%->36%: 963 | v2 |
| Memory compile policy (which fact types, order, cap) | Memory brief compiler | Preference adherence next call (code), then agenda milestone | Adherence per contact; policy test ~1,000/arm [I] | v2 |
| Register within bounds per segment | Register sliders | Blind listener panel first (metrics do not pick voices), then early hang-up | Panel + 686/arm | v3 |
| Voice per segment | Voice | Panel and language match; never auto-swapped | Effects likely tiny: TTS vendor moved intro hang-up 87.9-90.3% over ~99,400 calls [V, L6 L32] | v3 |
| Business outcome | Any approved variant | Outcome earned in code (webhook, CRM, booking) | 20->25%: 1,094/arm; 20->22%: **6,510/arm**; 10->11%: 14,751/arm | v2 when powered; bandits v3 |

Days to prove at a tenant's volume (total for both arms, from the JSON power table): opening 15->10% takes 14 days at 100 connected calls a day and 5 days at 300; a +10% outcome lift at 20% takes 131 days at 100 a day and 14 at 1,000. That is why "under-powered: about N more calls" is a first-class state, not an error: at pilot volume only 36% / 22% / 3.5% of collections / insurance / real-estate buyers can detect a +10% outcome lift in month one, while 51-80% clear the ~1,200-call local test (31-80% with D2C) [C L6 §4.2, L6V item 2].

**Never learned (locked, checked in code):** the AI disclosure and its three approved variants; the recording notice; consent, opt-out and DND handling; Tele-MANAS 14416, 112 and the crisis shape; identity (SCRIPT and IDENTITY locked lines); prices, offers, amounts and dates (FACTS_ROWS are the client's data, HV law 22); the promotion fence; reply-door predicates R1-R11 including the hang-up guard; the per-turn LEDGER and COUNTS_AND_GOAL_CHECK tail (position is mechanism: must-fire rules stay last); the governor; sound-tag caps. A learned change only ever replaces a middle slot, a number in the turn policy, a lexicon entry, a skill or a pacing weight.

**Volume ladder, shown as a badge on every agent:** L0 Listening (0-99 connected on this version: memory, fast lane, sim-only proposals labelled "simulated, not proved"); L1 Finding (100-499: moment ribbon with intervals; turn-taking tests once ~150-330 calls fit in 28 days); L2 Proving (1,200+ projected in 28 days: moment, opening and objection tests); L3 Proving outcomes (the outcome MDE fits in 28 days); L4 Optimising (1,000+ a day on one script, Premium, outcome or seat pricing: discounted Thompson).

## 3. The loop end to end

1. **Measure (code, every call).** The voice runtime stamps every TTS clause (moment id = brief slot + clause index + shape hash); the carrier gives the caller-side hang-up time; a hang-up is attributed to the moment whose audio was playing or ended within the last 2.0 s [I], otherwise to the caller's own turn after it. Turns carry cut-ins (stereo), reply gap, empty-ASR, language, ledger state and "how the caller sounds". Outcomes arrive from systems of record. **No LLM label decides anything** until its agreement with verified keys is measured and its inflation factor applied (IMD judge rules; L6V item 8).
2. **Detect.** Fast lane (§4). Slow lane: P(hazard > 1.25x reference) >= 0.99 with 50+ callers reaching the moment (IMD statistics_rules); a 2x line is found 19% / 67% / 94% at 100 / 500 / 1,000 calls [C L6]. Other triggers: cut-in spike (IMD M11), empty-ASR cluster (M14), tool errors (M13), language-hold misses, reply-door replacements (R3, R6), a knowledge gap (5+ calls deferring the same question [I]), or a manager marking a call "went badly".
3. **Triage (Call analyst).** Engineering before content: TTS error or silence at the clause, a reply gap over 2.5 s at that moment, empty ASR, carrier drops at the same second. Engineering causes become Issues for voice or economics-platform; only content causes go to the Coach.
4. **Propose, probe, compose (Coach + Test pilot, offline; harness2 made safe, req-35).**
   - *Reference:* replay the published version against a failure set: up to 12 real failing calls are reduced to *patterns*, then re-voiced by synthetic personas with hidden keys and fictional values. No real transcript or personal data enters the simulation lab.
   - *Personas:* six base Hinglish callers (busy, sceptical, elderly with a 2.4 s pause, noisy, angry, wrong person) plus up to six failure-derived ones; 3 seeds each; the reference is run twice to measure simulation noise (A/A floor n >= 60 per arm, L6 L11).
   - *Propose:* an invariant candidate (craft: turn length, question endings, repair, pacing) and a domain candidate (the tenant's facts, objections, procedures). Proposals read the tenant library first; anything this tenant already rejected or found null is not re-proposed unless the evidence changed.
   - *Probe:* contrasts measured in code: words per turn, question endings, stock phrases, ledger completion, disclosure delivered, language hold, hidden-key belief extraction (a judge extracts, code scores), simulated hang-up at the moment, cut-ins and reply gap (audio sims), first-token delta. Verdict per contrast: fixed / unchanged / regressed; "fixed" only beyond the reference-vs-reference spread.
   - *Compose:* every merge decision cites observation ids. A premise both candidates rely on ("people leave because the premium comes before the value") is probed alone first, the shared-assumption probe that answers harness2's propagated-false-premise failures (LMO §4.1).
   - Caps: 2 cycles per problem per day; workspace test budget INR 200 a day (WTR test class); about INR 100-200 per cycle [I, not metered].
5. **Gates (throw, never warn).** One `compile()`; voice lint L1-L7 (quoted lines, stage directions, numbers in prose, feeling labels, question instructions, must-fire outside the tail, disclosure or crisis removal: VMD); per-section byte caps (core 12,000, tail 1,900); locked-section diff empty, computed on the resolved config; provenance (no new number, price, date, percent, identifier, URL or brand absent from FACTS_ROWS); a manipulation lint (urgency, scarcity, fear, guilt, false social proof, false authority); the promotion fence on service agents; India latency (simulated first-token delta +50 ms p50 or less; skills lazy-loaded) [I]; every language variant handled; the full regression suite including multi-call memory tests.
6. **Card and one tap.** Problem with n and interval, the diff in shapes, the contrasts with seeds, the green gates, "calls to prove: ~1,180 (~12 days at your volume)", the INR effect on minutes, expiry. Buttons: Approve and test (default), Edit, Reject (with a reason that becomes a lesson), Ask VP. Approval is a hold-to-confirm tap bound to the args hash; a spoken "haan karo" renders the card but never approves (WTR approval_token).
7. **Prove online** (§5). Fixed horizon on the pre-registered metric; guardrails auto-stop.
8. **Decide, promote, expire.** Promote only on an interval that excludes 0 with no guardrail breach (A2 card; `version.publish`). Inconclusive keeps control and records "no detectable effect at n". Winners expire after 60 days (90 max) or on drift.
9. **Remember.** Every decision becomes a tenant Lesson (situation, change, evidence, scope, status, expiry). VP-wide invariant lessons hold no personal data (§11).

## 4. The fast lane: the owner's call 100 to call 101

**Rule (code, after every connected call):** flag moment j when hang-ups k_j >= 10 and P(h_j > 3x reference_j | Beta(0.5+k, 0.5+n-k)) >= 0.99, where n is callers who reached the moment. The reference is the tenant's own median per-position hazard once it has 1,000+ connected calls on other scripts, else the default prior curve (0.15, 0.08, 0.06, 0.05, ...; assumed in L6).

**Computed behaviour** (4,000 runs per row, seeded, `learning-module-defaults.json` fast_lane):

| Script | Flagged by call 15 / 20 / 30 / 50 / 100 | Median call of flag |
|---|---|---|
| Healthy, on the reference curve | 0 / 0 / 0 / 0 / 0 | never (0 of 4,000 by call 300) |
| Healthy but every line 1.5x the curve | 0 / 0 / 0 / 0 / 0.03% | - (0.05% by 300) |
| Healthy but every line 2x (badly wrong curve) | 0.08% / 0.08% / 0.15% / 0.47% / 0.95% | - (1.3% by 300) |
| 90% of hearers hang up, right after the opening | 89% / 99.7% / 100% | **13** |
| 90%, mid-call | 60% / 96% / 100% | **15** |
| 60%, right after the opening / mid-call | 18% / 62% / 96% ; 7% / 37% / 91% | 19 ; 22 |
| 40% after the opening / mid-call | 0.9% / 9.6% / 39% / 62% / 89% ; 0.3% / 4% / 38% / 90% / 99.7% | 38 ; 33 |
| 30% after the opening / mid-call | median 109 ; median 47 | |

Every flag fell on the right moment. Lines below 3x the curve are not "catastrophic" and go to the slow lane.

**What happens (the owner's example, illustrative clock):**
- Call 13: the counter fires. The Call analyst runs triage in seconds. If the cause is engineering (say the TTS returned silence on that clause), it becomes a Critical Issue, not a script change.
- If the current version introduced that moment and the previous version ran 200+ calls without the flag, VP switches back to the previous version at the next call boundary (A3), because the launch card's "auto-revert on catastrophic regression" policy is on by default, and tells you with undo.
- Otherwise VP throttles that script's pacing to 25% (A3, contact-saving, undo) so fewer customers hear the broken line while you decide. It never rewrites on its own.
- Within 15 minutes (p90 target [I]) a card reaches the approver's phone: "Line 2 pe 11 mein se 10 log call kaat rahe hain (normal: 1 in 12). Wajah: premium value se pehle aa raha hai. Naya version: pehle renewal ka fayda, phir amount. 18 simulated callers: hang-ups at this moment 9 -> 1, disclosure intact, no new numbers. Approve?"
- One tap: v8 is live from the next call. Readouts on callers who reach the moment: "no longer catastrophic" (P(h < 3x) >= 0.99) at median 29 callers (p90 81); "back to normal" (P(h < 1.5x) >= 0.95) at median 92 (p90 441) [C].
- Honest label: "fixed (before/after, not randomised)". Never "proved". So in the owner's example the line changes around call 15-30, with his tap, long before call 101; subtle lines still need ~1,200 calls of proof.

Harmonise IMD monitor M10 ("10+ hang-ups within the first 30 connected") to this continuous rule, so a line that turns bad on day 9 is also caught.

## 5. Statistics as code (the Learner, an engine, not an LLM)

- **Unit:** the contact. Arm = hash(contact_id, experiment_id), sticky for the experiment, so a person never meets two different versions of her mid-relationship.
- **Allocation:** 50/50. Safety ramp: the first 50 variant calls at 20%, guardrails only, excluded from the confirmatory read [I].
- **Pre-registration** (hashed, immutable, written before the first call): one primary metric, MDE, alpha 0.05 two-sided, power 0.8, n per arm, max 28 days and min 7 days so weekdays and novelty wash out [I], guardrails, analysis (two-proportion with contact-clustered errors), stop rule. Power uses the Fleiss formula, which reproduces L6's 1,565 for 50->45.
- **Stopping:** fixed horizon for the decision; always-valid tests (Johari et al., L6 L04) only for harm on guardrails. The client can watch any time: the meter fills, but the verdict stays hidden until the horizon, so watching cannot create false winners (daily peeking at a z-test: 16% false winners by day 7, 36-37% by day 90 [C L6 L03]).
- **A/A per tenant, at zero call cost:** every eligible call carries a *shadow* label (S1/S2 from hash(contact, month)) and the production procedure runs on it continuously for each metric that could be a primary. A permutation A/A (1,000 re-randomisations of contacts over 90 days) estimates the procedure's real false-winner rate on this tenant's data. An experiment on metric X may start only when the shadow A/A on X has the planned n and an empirical false-winner rate of 6.5% or less [C/I]. This also catches pipeline bugs: an outcome webhook that writes for some calls only shows up as a shadow "winner".
- **Concurrency:** one confirmatory test per slot; up to 3 per agent on orthogonal slots; more than two arms uses Bonferroni.
- **Read-outs:** effect and 95% interval from the pre-registered test; bandits read from a 10% uniform held-out split or AIPW, never their own means (Hadad et al., L6 L39).
- **Guardrails, auto-stop (A3):** opt-outs (always-valid one-sided, or 3+ and 2x control [I]); complaints (2+ and 2x); disclosure delivered below 99% (a drop is a bug: stop everything on that agent); any crisis turn without the crisis shape; reply-door replacements R3/R6 at 2x; early hang-up per 10-digit CLI (IMD M08, TRAI reg 21A: 5 flags in 10 days bring KYC re-verification and a 15-day bar; 140/1600/1601 exempt [O L6 L35]); minutes per agenda-done call +10% with no agenda or outcome gain (Goodhart alarm: blocks promotion); empty ASR on short replies +5 points; cut-ins +5 points; reply gap p90 over 2.5 s.
- **Expiry and drift:** 60 days by default. A drift alarm fires when the promoted metric sits outside the test's interval two weeks running; the winner turns "stale" and a re-confirm card offers a 10% holdback for one horizon. Plain Thompson still chose the old winner on day 90 in 56% of runs after a day-60 switch; discounted Thompson (gamma 0.97) was right 98.5% [C L6 §4.6].
- **Bandits (v3, Premium):** discounted Thompson only for 1,000+ connected a day on one script for 14 days, outcome delay 7 days or less (or a validated leading indicator), shadow A/A passed, outcome or seat pricing; 10% exploration floor; exploration on 10-digit CLIs stops when M08 fires.
- **Leading indicators** ("payment link opened") become a primary only after a per-tenant validation: one completed test where indicator and outcome moved in the same direction; until then "early read, outcome pending".

## 6. Objects (extend SCH)

**Moment** (agent version, slot, clause index, shape hash) · **MomentStats** (reached, hung, interval, reference, flag state) · **Flag** (lane, rule, n, triage result) · **Proposal** (kind: line, turn numbers, lexicon, objection pack, tool guidance, timing, memory policy, knowledge gap, panel request; diff; observation ids; gate results; calls-to-prove; INR impact; risk class; status) · **ProbeRun** (personas, seeds, candidate, run manifest) · **Contrast** (metric, reference vs candidate, spread, verdict) · **Experiment** (pre-registration hash, arms = versions, unit, horizon, guardrails, expiry) · **Assignment** (contact, arm, salt) · **Readout** (interim guardrails, final effect, interval) · **Decision** (promote, discard, inconclusive, stale) · **ShadowAA** (metric, n, empirical false-winner rate) · **Lesson** (tenant: situation, change, evidence, scope, status, expiry) · **InvariantLesson** (VP-wide: shape-level change, support from simulations and consented aggregate counts, no personal data) · **ChangeEntry** (timeline row: version, who approved, label, effect or "not measured") · **Holdout** (v3).

Relations: Call -> Turn -> Moment -> MomentStats -> Flag -> Proposal -> ProbeRun -> Contrast; Proposal -> Approval -> Version -> Experiment -> Readout -> Decision -> ChangeEntry and Lesson. All learning objects carry the run manifest combination that actually ran; a call is never filed under a preset it left (`rejected.2026-10-20.preset-override-attribution`).

## 7. Who does what

| Stage | VP agent / engine | Client sees | Client approves |
|---|---|---|---|
| Measure, detect | Engines; Call analyst explains | Moment ribbon over the script with intervals; level badge | - |
| Triage | Call analyst | "Engineering issue" or "content issue", with the clip | - |
| Fast-lane protection | Learner, Campaign runner (A3) | "VP switched back to v7 / slowed this script to 25%; undo" | Undo only |
| Propose, probe | Coach, Test pilot, Brief writer | Card: problem, diff, contrasts, gates, calls to prove, INR | Approve and test / Edit / Reject |
| Gates | Compliance guard + engines | Green list; a blocked proposal says which gate and why | - (never overridable) |
| Experiment | Learner | Power meter, "under-powered: ~640 more calls (~7 days)", guardrails live | Start (A2) |
| Guardrail stop | Learner (A3) | "Stopped: opt-outs 2.4x control; v12 back to 0%" | Undo needs A2 |
| Promote | Learner proposes | Effect with interval | Promote (A2) |
| Expire, drift | Learner | "Stale since 12 Dec"; re-confirm card | Re-test (A2) |
| Explain | Operator | Chat answers with charts and clips, n and grade | - |

**Flows.**
- **F1 Fast lane:** §4.
- **F2 Slow loop (illustrative numbers):** flag at ~500-1,000 calls -> card within 24 h -> Approve and test -> experiment page fills -> at the horizon a Promote card ("v12 ne line 4 ka drop 10.2% -> 5.9% kiya, 95% interval 1.8-6.7 points, 1,190 calls") -> timeline entry.
- **F3 Turn-taking tune, likely the first proved change [I] (illustrative):** the Call analyst sees cut-ins concentrated on callers with long mid-sentence pauses; the Coach proposes unsure hold 600 -> 900 ms for callers whose measured pace is slow; audio sims must show the 2.4 s elderly pause survives in 10 of 12 battery turns (the VMD Patient target; every VP stack takes it 12 of 12 today, `research/2026-10-17/lanes/l8-azure-bench/round2/findings.md`) before the card ships; the test needs ~100 calls per arm; reply gap guarded within +150 ms (112 turns per arm unclustered at an assumed 450 ms sd).
- **F4 Knowledge gap:** "14 callers asked about the grace period; she had no fact and said a colleague would confirm. Add the fact?" The client types the value; it becomes a FACTS_ROWS entry (data, never learned text) and the deferral rate is tracked.
- **F5 Expiry:** "v12 was proved 60 days ago. Re-confirm with 10% of calls for 9 days?"
- **F6 Ask:** "Pune mein log line 3 pe kyun ruk rahe hain?" returns the ribbon for Pune with "observed, not causal", three clips with play-from-here, and the open proposal. "Kya v12 better hai?" returns the interval, or "abhi pata nahi: ~640 more calls".
- **F7 Launch card learning row:** level badge, auto-revert policy (default on), inbox cap, tier.

## 8. Copy rules (enforced in code)

Allowed: "remembers every customer", "shows where calls fail", "proves the changes you approve", "VP found", "you approved", "proved on N calls, 95% interval a-b", "simulated, not yet proved", "observed, not causal", "fixed (before/after, not randomised)". Blocked below L4 in Operator replies, the Today brief, cards and (proposed) the marketing site: "learns on its own", "self-learning", "gets better with every call", "AI-optimised". The timeline never sums point estimates into a "+38% since launch" figure; a cumulative number appears only with a holdout (v3).

## 9. Pricing, tiers and cost

- **Minutes rule (brief item 7).** Autonomous allocation (bandits, auto-ramp) and any objective that includes minutes (call length, completion without agenda, engagement) run only under outcome or seat pricing. **Where I cannot honour it literally:** a moment fix keeps people on the line longer, so the hazard metric correlates with minutes; barring it under per-minute pricing would bar the owner's own call-100 example for every self-serve tenant. So: human-approved fixed-horizon tests may decide on the *agenda milestone* (value the client asked for), the card shows the INR per month the change adds, and the Goodhart alarm blocks promotion when minutes per agenda-done call rise 10% with no gain. Proposed owner option: auto-revert and credit the extra minutes when an approved change raises minutes per call 5%+ with no agenda or outcome gain at its horizon (L6 §4.8: +2.7% minutes for zero gain). Per-minute launch pricing was itself rejected for margin (`rejected.2026-10-17.per-minute-launch`).
- **Tiers (req-36, proposed; price is the owner's):** Base: moment ribbon and the fast lane with a Coach proposal, because a broken line is a defect, not an upsell. Plus: learning inbox, experiments with A/A, power meter, expiry, timeline, tenant library, memory. Premium: discounted Thompson, guarded auto-ramp, holdout, segment priors when they exist, surrogate validation.
- **Cost:** shadow A/A and experiments add no calls; simulation spend is about INR 100-200 per proposal cycle [I] inside the INR 200 a day test budget, shown on each card. Compare Retell AI QA at USD 0.10/min and Conductor credits at USD 0.20 [O].

## 10. Emotional voice, memory, personalisation and self-learning in this module

- **Emotional voice.** The ledger's read of the caller (hurried, irritated, worried, chatty, confused) segments every ribbon: "irritated callers leave at line 3; others don't". Expressive changes (register, tone notes, pace) never go live on metrics alone: a blind listener panel with accent as its own axis comes first (HV law 26, `rejected.harvest.09`). Warmth can only go *down* on angry or collections segments without a panel (P4; Crolic via L5). The manipulation lint and the outcome definition make pressure unprofitable: the decision outcome is a commitment **kept** (payment received, booking attended), never a promise extracted.
- **Memory.** Memory-omni writes facts; this module only tests the compile policy and runs multi-call simulations (promise recalled, language held on call 2, opt-out honoured on call 3), the live adherence test the harvest says we need (stored Hindi, replied in English: `docs/harvest/hp-handoffs.md` l.36). Sticky arms keep relationships continuous.
- **Personalisation.** Per-contact adaptations apply at once from memory (Patient preset for slow speakers, language, stated time); the learning module tests the *policy* ("auto-Patient when pace is slow") at tenant level. Subgroups must be pre-registered; a post-hoc subgroup finding is a proposal labelled "observed, not causal".
- **Self-learning.** It is the pipeline above, at the honest speed the volume allows, made visible.

## 11. Beyond everyone

1. A per-moment hang-up hazard with intervals from clause timestamps, no LLM in the label.
2. A fast lane that catches a 90% line by call 13-15 with 0 false flags in 4,000 healthy runs [C], plus auto-revert of regressions and a contact-saving throttle.
3. "Calls to prove" and an ETA on every proposal, before you approve.
4. Shadow A/A on every tenant at zero call cost, which also catches broken outcome writers.
5. Locked sections enforced as an empty diff on the resolved config, and a provenance gate: a learned line cannot introduce a number.
6. Simulation with hidden keys scored in code, a measured simulation noise floor, Hinglish personas incl. the 2.4 s elderly pause, and multi-call memory tests.
7. harness2's propose-probe-compose with a shared-assumption probe and a human gate, adapted from document tasks to calls.
8. Winners that expire, and drift alarms that mark them stale.
9. A "how she changed for you" timeline that includes changes that did nothing or were rolled back.
10. A tenant library that refuses to re-propose what this tenant's data already rejected, the same discipline as this project's own `rejected.*` nodes.
11. Regulation-aware exploration: experiments stop on 10-digit CLIs when the reg 21A guard fires.
12. Knowledge-gap cards that ask the client for a fact instead of letting a model invent one.
13. Kept-commitment outcomes that make manipulation lose.
14. Learning from groups without pooling transcripts: invariant lessons from simulations and consented aggregate counts, each with its support count, re-checked against the tenant's own evidence (req-33).
15. A copy linter that stops VP itself from over-claiming.

## 12. Metrics (targets; how measured)

See the metrics field. Headline: shadow A/A false winners 5% or less (6.5% band); 0 locked-section diffs and 0 new numbers reaching a version; fast-lane flag for 90% lines by call 20 in 95%+ of runs and for 60% lines by call 50 in 99%+ [C], card within 15 min p90; 80%+ of promoted changes hold at re-confirm; simulation-to-live direction agreement measured (target 70%+ [I]); 50%+ of L2 tenants with one proved change in 30 days [I]; 0 banned claims shipped.

## 13. Phasing

- **v1 (learning-ready):** clause-aligned hang-up capture, moment ribbon, fast lane with triage, auto-revert and throttle, Coach proposal with simulation and gates, version timeline without effect claims, shadow labels recorded silently. Why: signals need history from day one; a catastrophic line is a v1 defect; brief v2, the ledger and the hang-up guard already exist in the lab (`decision.2026-10-20.brief-v2-ledger`), and the gates are specified in VMD. Exit: fast lane validated on synthetic call streams; 0 gate escapes in a red-team set.
- **v2 (she gets better, provably):** inbox, PPC, experiments with pre-registration, shadow and permutation A/A, power meter, guardrail auto-stop, expiry, turn-taking, opening, objection, best-time and memory-policy tests, knowledge-gap cards, tenant library, timeline with intervals. Why: owner order puts memory and personalisation before self-learning (req-32, req-34); dense metrics prove in ~100-1,200 calls. Exit: A/A false winners 5% or less on 3 design partners; one proved change per L2 partner; sim-to-live agreement measured.
- **v3 (at volume):** discounted Thompson, guarded auto-ramp, holdout, surrogate validation, segment priors (10+ consented tenants, counsel cleared), invariant lessons from aggregates, register and voice panels per segment. Why: bandits pay only from about 1,000 calls a day (L6 §4.3); pooling only when tenants are alike (L6 §4.7).

## 14. Risks, rejected ideas avoided, open questions

Risks and open questions are listed in their fields. **Rejected ideas avoided:** `rejected.2026-10-17.k2-dashboards` (no daily two-arm winners), `rejected.2026-10-17.cross-tenant-pooling` (aggregates only, v3, contract-gated), `rejected.harvest.03` (safety by predicate, not instruction), `rejected.harvest.04` (no model-emitted marker approves or deletes), `rejected.harvest.12` (no holistic LLM judge as a gate), `rejected.harvest.14` (simulations never on production quota), `rejected.harvest.15` (simulator prompts framed as QA writing tasks), `rejected.2026-10-20.raw-fact-memory`, `rejected.2026-10-20.brief-v1` (learned text is shapes), `rejected.2026-10-20.unguarded-hangup` (the guard is locked), `rejected.2026-10-17.speculative-release` (no learned speculative-release parameter without a negation-aware matcher), `rejected.2026-10-20.silent-fallback-in-tests` and `rejected.2026-10-20.preset-override-attribution` (every probe and arm filed under what ran), `rejected.2026-10-17.dialect-tts-wedge` (dialect only opt-in), `rejected.2026-10-17.per-minute-launch` (pricing interplay), `rejected.2026-10-20.gemini-tts-style-prefix` (no learned text prefixes reach TTS), `rejected.2026-10-20.free-key-rotation` (simulation never routes around quota).
