#!/usr/bin/env python3
# r5: writes context/inbox/main-2026-10-24-benches-r5.json (nodes, edges, one event) in the bench worktree. The integrator
# merges it. Numbers are read from research/2026-10-24/benches-r5/comparison.json, and the titles are asserted against
# them, so a title cannot drift from the data. Merge order: context/inbox/calls-2026-10-24.json first (it holds
# decision.2026-10-24.objection-always-a-moment, which edges here point at), then this file.
import json, sys
W = '/dev/shm/wt-bench5'
P = 'research/2026-10-24/benches-r5'
OUT = sys.argv[1] if len(sys.argv) > 1 else f'{W}/context/inbox/main-2026-10-24-benches-r5.json'
C = json.load(open(f'{W}/{P}/comparison.json'))
A = C['analysis']; D = A['dev']; TE = A['test']; REG = A['regression']; PO = A['miniOutcomePooled_exploratory']
mk = lambda m, p, k: TE[m][p]['metrics'][k]
# the numbers the titles state, checked against comparison.json
assert [D[a]['metrics']['outcomeK'] for a in ('current', 'r4-table', 'r3-stance', 'no-outcome-rules')] == [40, 42, 38, 37]
assert [D[a]['metrics']['objectionK'] for a in ('current', 'r4-table', 'r3-stance', 'no-outcome-rules')] == [11, 11, 11, 9]
assert [mk('gpt-4.1-mini', p, 'outcomeK') for p in ('p1', 'p2')] == [38, 39]
assert [mk('tiered', p, 'outcomeK') for p in ('p1', 'p2')] == [42, 42] and [mk('gpt-4.1', p, 'outcomeK') for p in ('p1', 'p2')] == [42, 42]
assert all(mk(m, p, 'objectionK') == 10 and mk(m, p, 'momentK') == 36 and mk(m, p, 'commitmentK') == 10 for m in ('gpt-4.1-mini', 'tiered', 'gpt-4.1') for p in ('p1', 'p2'))
assert REG['r4'] == '43/51' and REG['r5'] == '51/51' and REG['r4_vs_r5_runCallPairs']['p'] == 0.0078 and len(REG['r4_vs_r5_runCallPairs']['bOnly']) == 8 and REG['lostInR4_allBack']
assert REG['miniRecordsOnly']['r5'] == '47/47' and REG['miniRecordsOnly']['mcnemar']['p'] == 0.0078
assert PO['r4'] == '125/126' and PO['r5'] == '117/126' and PO['mcnemar_runCallPairs']['p'] == 0.0078 and PO['distinctCalls']['signTestP'] == 0.0312
assert [TE['tiered'][p]['escalation']['escalated'] for p in ('p1', 'p2')] == [2, 2]
assert C['spend']['total']['inr'] == 40.1 and C['spend']['total']['requests'] == 404
assert A['reverseIf']['tiered']['outcomeK']['aheadByMean'] == 3.5 and not A['reverseIf']['tiered']['reverseMet']

M = ("through round 4's harness (research/2026-10-24/benches-r4/harness; azure-guard.mjs byte-identical to round 1's) with "
     "paths changed: private tmpfs Postgres, a fresh migrated DB per run, its own ledger, global cap Rs 60, sequential, at most "
     "1 request a second. Tree ab5dade (contains 2cdf64b; detached, unmodified). Cases and the DEV/TEST split byte-identical to "
     "round 4's tree 8e3440a. Scored by code against hand-written keys; exact two-sided McNemar on the same ids.")
nodes = [
 {"id": "measure.2026-10-24.analysis-bench-r5-dev-ablation", "type": "measurement", "status": "measured", "date": "2026-10-24", "source": "verified",
  "title": "Analysis bench DEV (42 calls), gpt-4.1-mini, one pass per 2cdf64b contract arm, tree ab5dade: current (the product) outcome 40/42, objections 11/11, moments 36/36; r4-table (b1a80cf, prompt byte-identical to round 4's) 42/42, 11/11; r3-stance (bfa7ee7, byte-identical to round 3's) 38/42, 11/11; no-outcome-rules 37/42, 9/11. Round 4's 2 DEV objection losses did not reproduce with round 4's own prompt (r4 DEV -> r4-table: outcome 0 discordant, objections 2 gained, p = 0.5), so on DEV they were run-to-run variance; the pre-registered 'table crowds out objections' is not shown. current lost 2 outcomes to false nulls that r4-table got right in the same round (complaint.telecom, wrong_person.telecom; p = 0.5). Pre-registered stop rule (outcome <= 38/42, objections < 9/11) not met. Rs 8.08",
  "n": 42, "method": "product/scripts/analysis-bench.ts --split dev --prompt-variant <arm>, once per arm in the order current, r4-table, r3-stance, no-outcome-rules, crisis judge off, " + M + " Stop rule and reading written before the first request (harness/dev-stop-rule.txt). Arm prompts compared byte for byte with analysisPrompt() at 8e3440a and bfa7ee7 (harness/variant-probe.ts, no model).",
  "path": f"{P}/README.md"},
 {"id": "measure.2026-10-24.analysis-bench-r5-gpt-4.1-mini", "type": "measurement", "status": "measured", "date": "2026-10-24", "source": "verified",
  "title": "Analysis bench TEST (42 calls), gpt-4.1-mini single on the 2cdf64b contract, two passes, tree ab5dade: objections 10/10 both (r4 9, 8), moments 36/36 both, every moment 42/42 both, commitments 10/10 - but outcome 38/42 and 39/42 (mean 38.5, 91.7%, CI 79.4-96.9; r4 42 and 41): complaint -> null x3 and x2, wrong_person -> null x1 each. Per pass r4 -> r5: 4 lost p = 0.125, 2 lost p = 0.5. Pooled with DEV [exploratory]: 125/126 -> 117/126, 8 lost 0 gained, p = 0.0078; 6 distinct calls worse, 0 better, sign p = 0.031; complaint template 8/9 -> 3/9, wrong_person 9/9 -> 6/9. Mini now names CONV_NEEDS_HUMAN on complaint calls (CONV_COMPLAINT under r4-table) and records no outcome; no quote was dropped. Rs 0.050 per model-analysed call, about Rs 0.073-0.075 per 3-minute call; prompt 714.6 -> 754.6 input tokens",
  "n": 42, "method": "analysis-bench.ts --split test (contract current), twice (p1, p2; interleaved with tiered), crisis judge off, " + M + " Outcome nulls inspected in each run's database (outcomeUnclear empty on every miss).",
  "path": f"{P}/README.md"},
 {"id": "measure.2026-10-24.analysis-bench-r5-tiered", "type": "measurement", "status": "measured", "date": "2026-10-24", "source": "verified",
  "title": "Analysis bench TEST, tiered (gpt-4.1-mini first, gpt-4.1 on escalation, threshold 0.6) on the 2cdf64b contract, two passes, tree ab5dade: outcome 42/42 and 42/42 (0 discordant against round 4), objections 10/10, moments 36/36, commitments 10/10 both passes. Escalated 2/39 each pass (5.1%, CI 1.4-16.9; r4 0 and 1), all on 'no outcome', all 4 fixed a wrong null (complaint.ecommerce x2, complaint.education, wrong_person.realestate). Ahead of mini by 4 and 3 (mean 3.5) on outcome. Rs 0.065 per model-analysed call, about Rs 0.093-0.095 per 3-minute call [inference], inside the Rs 0.17 budget",
  "n": 42, "method": "analysis-bench.ts --split test --model <gpt-4.1-mini> --escalate-model <gpt-4.1> --threshold 0.6, twice, both deployments priced; cost from the bench's per-call cost lines priced per model (insight request excluded); 3-minute cost = 0.073 + e x 0.38 (ANALYSIS-COST.md). " + M,
  "path": f"{P}/README.md"},
 {"id": "measure.2026-10-24.analysis-bench-r5-gpt-4.1", "type": "measurement", "status": "measured", "date": "2026-10-24", "source": "verified",
  "title": "Analysis bench TEST, gpt-4.1 single on the 2cdf64b contract (the reference), two passes, tree ab5dade: outcome 42/42 and 42/42, objections 10/10, moments 36/36, commitments 10/10 both, 0 discordant against round 4 and against tiered. Rs 0.265 / 0.269 per model-analysed call, about Rs 0.38 per 3-minute call: over the Rs 0.17 budget",
  "n": 42, "method": "Same as measure.2026-10-24.analysis-bench-r5-gpt-4.1-mini, on deployment gpt-4.1-2025-04-14; run last, only because the Rs 60 cap allowed it after the others.",
  "path": f"{P}/README.md"},
 {"id": "measure.2026-10-24.analysis-objection-recall-r5-mini-first", "type": "measurement", "status": "measured", "date": "2026-10-24", "source": "verified",
  "title": "Objection recall over the mini-first analysis runs (DEV current, mini p1/p2, tiered p1/p2), 2cdf64b contract, tree ab5dade: 51/51 (round 3 51/51, round 4 43/51); round 4 -> 5 exact McNemar on (run, call) pairs 8 gained, 0 lost, p = 0.0078; mini's own records only (escalated pairs excluded) 39/47 -> 47/47, p = 0.0078; distinct calls 5 better, 0 worse, sign p = 0.0625. All 5 round-4 loss calls back in every run (objection_resolved.realestate 0/4 -> 4/4, .ecommerce, .telecom, complaint.lending, complaint.realestate); no new miss",
  "n": 51, "method": "(run, call) pairs of the 5 mini-first runs, each objection call has exactly one objection moment; per-call recall = 'objection' among the stored moment kinds; harness/stats.py (regression block) over research/2026-10-24/benches-r4 and -r5 JSONs, same ids.",
  "path": f"{P}/comparison.json"},
 {"id": "rejected.2026-10-24.objection-contract-mini-false-nulls", "type": "rejection", "status": "rejected", "date": "2026-10-24", "source": "verified",
  "title": "The 2cdf64b analysis contract as it stands, on gpt-4.1-mini single [cause is inference]: it restores objections (43/51 -> 51/51) but brings back the round-3 false nulls on complaint and wrong-person calls (mini TEST outcome 42, 41 -> 38, 39)",
  "tried": "product/server/modules/calls/analysis.ts:60 (KIND 'one entry per PERSON line that shows it, whatever the OUTCOME; one line can show two kinds') and :62 ('Every complaining PERSON line is an objection, even when the PERSON agrees later: then list both'), with the b1a80cf outcome table kept. DEV one pass per arm, TEST two passes per design.",
  "broke": "mini single outcome on DEV + TEST p1 + p2: 125/126 -> 117/126 (8 lost, 0 gained, p = 0.0078 exploratory; 6 distinct calls, sign p = 0.031). Complaint template 8/9 -> 3/9: mini names CONV_NEEDS_HUMAN instead of CONV_COMPLAINT, lists the objection, records no outcome (outcomeUnclear empty: the model gave none). wrong_person 9/9 -> 6/9. Same-round DEV control r4-table got both of current's DEV misses right (p = 0.5). Pre-registered 'outcome gains kept' (each mini TEST pass >= 40/42) not met. Tiered and gpt-4.1 unaffected (42/42): tiered's 4 escalations were exactly these nulls."},
 {"id": "open.2026-10-24.analysis-contract-objections-and-outcome", "type": "open-question", "status": "open", "date": "2026-10-24", "source": "model",
  "title": "Which analysis contract keeps both mini's objections (round 5: 51/51) and its outcome (round 4: 41.5/42 mean on TEST)? Candidates [inference]: the 2cdf64b objection line without 'whatever the OUTCOME' in the KIND header; or the moment rules after OUTCOME (the alternative decision.2026-10-24.objection-always-a-moment names)",
  "closes_when": "A DEV ablation with at least two passes per arm, then two TEST passes on the chosen contract: gpt-4.1-mini single outcome >= 41/42 on the mean, complaint and wrong_person templates without false nulls, and objections 10/10 on both passes (and >= 50/51 over the mini-first runs)."},
]
E = lambda f, t, r: {'from': f, 'to': t, 'relation': r}
DEV, MINI, TIER, G41, OBJ = ('measure.2026-10-24.analysis-bench-r5-dev-ablation', 'measure.2026-10-24.analysis-bench-r5-gpt-4.1-mini',
                             'measure.2026-10-24.analysis-bench-r5-tiered', 'measure.2026-10-24.analysis-bench-r5-gpt-4.1',
                             'measure.2026-10-24.analysis-objection-recall-r5-mini-first')
REJ, OPEN = 'rejected.2026-10-24.objection-contract-mini-false-nulls', 'open.2026-10-24.analysis-contract-objections-and-outcome'
FIX, DEFAULT = 'decision.2026-10-24.objection-always-a-moment', 'decision.2026-10-23.analysis-default-mini-single'
R4REJ = 'rejected.2026-10-24.analysis-outcome-shapes-mini-drops-objections'
edges = [
 # round 4 (and round 3) -> round 5
 E(DEV, 'measure.2026-10-24.analysis-bench-r4-dev-gpt-4.1-mini', 'extends'),
 E(DEV, 'measure.2026-10-23.analysis-bench-r3-dev-gpt-4.1-mini', 'extends'),
 E(MINI, 'measure.2026-10-24.analysis-bench-r4-gpt-4.1-mini', 'extends'),
 E(MINI, 'measure.2026-10-23.analysis-bench-r3-gpt-4.1-mini', 'extends'),
 E(TIER, 'measure.2026-10-24.analysis-bench-r4-tiered', 'extends'),
 E(G41, 'measure.2026-10-24.analysis-bench-r4-gpt-4.1', 'extends'),
 E(OBJ, 'measure.2026-10-24.analysis-bench-r4-gpt-4.1-mini', 'extends'),
 E(OBJ, 'measure.2026-10-24.analysis-bench-r4-dev-gpt-4.1-mini', 'extends'),
 E(OBJ, 'measure.2026-10-24.analysis-bench-r4-tiered', 'extends'),
 E(OBJ, 'measure.2026-10-23.analysis-bench-r3-gpt-4.1-mini', 'extends'),
 E(OBJ, MINI, 'derived-from'), E(OBJ, TIER, 'derived-from'), E(OBJ, DEV, 'derived-from'),
 # the fix under test
 E(OBJ, FIX, 'supports'),
 E(OBJ, R4REJ, 'tests'),
 E(DEV, FIX, 'tests'),
 E(DEV, R4REJ, 'challenges'),
 E(DEV, 'decision.2026-10-24.analysis-outcome-shapes', 'supports'),
 E(MINI, FIX, 'tests'),
 E(MINI, 'rejected.2026-10-23.analysis-stance-rule-mini-false-nulls', 'informs'),
 # the default decision
 E(MINI, DEFAULT, 'tests'), E(TIER, DEFAULT, 'tests'), E(G41, DEFAULT, 'tests'),
 E(TIER, 'decision.2026-10-23.tiered-skips-engine-decided', 'supports'),
 E(MINI, 'open.2026-10-23.analysis-default-design', 'informs'), E(TIER, 'open.2026-10-23.analysis-default-design', 'informs'),
 # the rejection and the open question
 E(REJ, FIX, 'challenges'),
 E(REJ, DEFAULT, 'informs'),
 E(REJ, 'rejected.2026-10-23.analysis-stance-rule-mini-false-nulls', 'extends'),
 E(REJ, 'component.product.calls-module', 'challenges'),
 E(REJ, MINI, 'derived-from'), E(REJ, DEV, 'derived-from'),
 E(OPEN, FIX, 'tests'), E(OPEN, REJ, 'informed-by'), E(OPEN, DEFAULT, 'informs'),
] + [E(m, 'component.product.calls-module', 'tests') for m in (DEV, MINI, TIER, G41)] \
  + [E(m, 'component.product.analysis-bench', 'derived-from') for m in (DEV, MINI, TIER, G41)]
events = [{"date": "2026-10-24", "event": "benches-r5-analysis-on-azure",
  "details": "Round 5, analysis only, tree ab5dade (2cdf64b's objection contract): DEV ablation one pass per arm on gpt-4.1-mini (current 40/42 outcome, 11/11 objections; r4-table 42/42, 11/11; r3-stance 38/42, 11/11; no-outcome-rules 37/42, 9/11; stop rule not met), then TEST two passes each of mini single (38, 39/42; objections 10/10 both), tiered (42, 42; escalated 2 and 2 of 39, all fixed a wrong null) and gpt-4.1 single as reference (42, 42). Objection recall over the mini-first runs 43/51 -> 51/51 (p = 0.0078), all 5 round-4 loss calls back; but mini's false nulls on complaint/wrong_person are back (DEV+TEST 125/126 -> 117/126, p = 0.0078 exploratory). decision.2026-10-23.analysis-default-mini-single stands by its reverse_if (tiered ahead by 3.5, bar is more than 4). Sequential, at most 1 request a second, round 4 harness with paths changed. Rs 40.10 at list prices (cap Rs 60), 0 HTTP errors, 0 429s. Results in research/2026-10-24/benches-r5/."}]
json.dump({'nodes': nodes, 'edges': edges, 'events': events}, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(len(nodes), len(edges), OUT)
