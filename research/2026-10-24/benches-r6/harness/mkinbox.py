#!/usr/bin/env python3
# r6: writes context/inbox/main-2026-10-24-benches-r6.json (nodes, edges, one event) in the bench worktree. The integrator
# merges it. Numbers are read from research/2026-10-24/benches-r6/comparison.json, and the titles are asserted against
# them, so a title cannot drift from the data. The merge tool cannot change an existing node's status, so the proposed
# closure of open.2026-10-24.analysis-contract-objections-and-outcome is listed under proposedStatusChanges (ignored by
# --merge) for the integrator to apply, and carried by an 'answers' edge.
import json, sys
W = '/dev/shm/wt-bench6'
P = 'research/2026-10-24/benches-r6'
OUT = sys.argv[1] if len(sys.argv) > 1 else f'{W}/context/inbox/main-2026-10-24-benches-r6.json'
C = json.load(open(f'{W}/{P}/comparison.json'))
A = C['analysis']; D = A['dev']; TE = A['test']; S = D['selection']; MI = TE['gpt-4.1-mini']; TI = TE['tiered']
ARMS = ('current', 'r5-short-objection', 'r5-outcome-first', 'r5-moment-not-outcome')
dk = lambda a, k: [D[a][p]['metrics'][k] for p in ('p1', 'p2')]
tk = lambda k: [MI[p]['metrics'][k] for p in ('p1', 'p2')]
tm = lambda a, t: [D[a][p]['metrics']['templates'][t]['k'] for p in ('p1', 'p2')]
# the numbers the titles state, checked against comparison.json
assert C['tree'] == '839292db0bff5e5669beab2f5307e9ac9b213eeb'
assert [dk(a, 'outcomeK') for a in ARMS] == [[41, 40], [40, 41], [42, 42], [41, 41]]
assert [D[a]['meanOutcome'] for a in ARMS] == [40.5, 40.5, 42.0, 41.0]
assert [dk(a, 'objectionK') for a in ARMS] == [[11, 11], [9, 11], [11, 11], [11, 11]]
assert [dk(a, 'momentK') for a in ARMS] == [[36, 36], [34, 36], [36, 36], [36, 36]]
assert all(dk(a, 'commitmentK') == [11, 11] for a in ARMS)
assert [D[a]['eligible'] for a in ARMS] == [True, False, True, True] and S['winner'] == 'r5-outcome-first' and S['tiedAtBest'] == ['r5-outcome-first']
assert [sum(tm(a, 'complaint')) + sum(tm(a, 'wrong_person')) for a in ARMS] == [9, 9, 12, 10]
assert D['r5-outcome-first']['vs_current_pooledPasses_exploratory']['p'] == 0.25 and len(D['r5-outcome-first']['vs_current_pooledPasses_exploratory']['bOnly']) == 3
assert [D[a]['passToPass']['outcomeValue'] for a in ARMS] == [3, 3, 0, 2]
assert D['r5-short-objection']['p1']['metrics']['objectionMissIds'] == ['objection_resolved.lending.hinglish', 'objection_resolved.telecom.hinglish']
assert tk('outcomeK') == [42, 42] and tk('objectionK') == [10, 10] and tk('momentK') == [36, 36] and tk('commitmentK') == [10, 10] and tk('allMomentsK') == [42, 42]
assert MI['meanOfPasses']['outcomeMean'] == 42.0 and MI['passToPass']['any'] == 0
assert [MI[p]['vs_r5mini_samePass']['outcome']['p'] for p in ('p1', 'p2')] == [0.125, 0.25]
assert [len(MI[p]['vs_r5mini_samePass']['outcome']['bOnly']) for p in ('p1', 'p2')] == [4, 3] and all(not MI[p]['vs_r5mini_samePass']['outcome']['aOnly'] for p in ('p1', 'p2'))
assert MI['vs_r5mini_pooled_exploratory']['p'] == 0.0156 and len(MI['vs_r5mini_pooled_exploratory']['bOnly']) == 7 and not MI['vs_r5mini_pooled_exploratory']['aOnly']
assert MI['vs_r5mini_pooled_exploratory']['distinctCalls']['signTestP'] == 0.125
assert MI['vs_r4mini_pooled_exploratory']['p'] == 1.0 and len(MI['vs_r4mini_pooled_exploratory']['bOnly']) == 1 and not MI['vs_r4mini_pooled_exploratory']['aOnly']
assert MI['templatesPooled'] == {'complaint': '6/6', 'wrong_person': '6/6'}
assert TI['metrics']['outcomeK'] == 42 and TI['escalation']['escalated'] == 0 and TI['escalation']['analysed'] == 39
assert A['miniFirstObjections']['text'] == '52/52' and A['replace']['allMet']
assert not A['reverseIf_analysis-default-tiered']['reverses'] and A['reverseIf_analysis-default-tiered']['matchesThisRound']
assert C['spend']['total']['inr'] == 23.91 and C['spend']['total']['requests'] == 440 and C['spend']['total']['httpErrors'] == 0
cpm = [round(MI[p]['cost']['inrPerCall'], 4) for p in ('p1', 'p2')]; assert cpm == [0.0519, 0.0524]
assert A['costPerCall']['test-tiered-r5-outcome-first-p1'] == 0.052

M = ("through round 5's harness (research/2026-10-24/benches-r5/harness; azure-guard.mjs byte-identical to round 1's) with "
     "paths changed: private tmpfs Postgres, a fresh migrated DB per run (each pass its own process; --passes not used), its own "
     "ledger, global cap Rs 60, sequential, at most 1 request a second. Tree 839292d (contains 95339a6; detached). Cases and the "
     "DEV/TEST split byte-identical to round 5's tree ab5dade; current, r4-table, r3-stance and no-outcome-rules build byte-identical "
     "prompts to ab5dade (harness/variant-probe.ts). --model <gpt-4.1-mini> pins single (same request as round 5's mini single). "
     "Scored by code against hand-written keys; exact two-sided McNemar on the same ids.")
SEL = "Arm chosen by harness/dev-select-rule.txt (mtime 04:14:17Z, before the first request at 04:15:14Z)."
nodes = [
 {"id": "measure.2026-10-24.analysis-bench-r6-dev-arms", "type": "measurement", "status": "measured", "date": "2026-10-24", "source": "verified",
  "title": "Analysis bench DEV (42 calls), gpt-4.1-mini single, two passes per 95339a6 contract arm, tree 839292d: current (the product) outcome 41, 40 (mean 40.5); r5-short-objection 40, 41 (40.5) but objections 9/11 and moments 34/36 on p1 (objection_resolved.lending, .telecom: complain-then-agree), so not eligible; r5-outcome-first (current's 26 lines, OUTCOME block before KIND) 42, 42 (42.0), objections 11/11, moments 36/36, commitments 11/11 both, 0/42 pass-to-pass outcome disagreement; r5-moment-not-outcome 41, 41 (41.0). Every miss is a false null with no outcome given (outcomeUnclear empty). Complaint + wrong_person (12 pairs per arm): current 9, short-objection 9, outcome-first 12, moment-not-outcome 10. Pre-registered winner: r5-outcome-first (no tie). current -> outcome-first pooled over both passes 3 gained, 0 lost, p = 0.25 [exploratory]. Rs 17.33",
  "n": 42, "method": "product/scripts/analysis-bench.ts --split dev --model <gpt-4.1-mini> --prompt-variant <arm>, two passes per arm (pass 1 of each arm, then pass 2), crisis judge off, " + M + " Selection rule written before the first request (harness/dev-select-rule.txt: eligible = objections 11/11, moments >= 35/36, commitments 11/11 on both passes; winner = highest mean outcome; ties to the arm closest to current by line diff). Misses read from each run database (harness/misses.py, db-misses.json).",
  "path": f"{P}/README.md"},
 {"id": "measure.2026-10-24.analysis-bench-r6-outcome-first-mini", "type": "measurement", "status": "measured", "date": "2026-10-24", "source": "verified",
  "title": "Analysis bench TEST (42 calls), gpt-4.1-mini single on the r5-outcome-first contract (current's lines, OUTCOME before KIND), two passes, tree 839292d: outcome 42/42 and 42/42 (mean 42.0, CI 91.6-100; round 5 current 38, 39; round 4 42, 41), objections 10/10, moments 36/36, commitments 10/10, every moment 42/42 both, 0/42 pass-to-pass disagreement on any field. Complaint 6/6 and wrong_person 6/6 (round 5: 1/6 and 4/6). Against round 5 mini single: p1 4 gained 0 lost p = 0.125, p2 3 gained p = 0.25; pooled 7 gained 0 lost p = 0.0156 [exploratory]; 4 distinct calls better, 0 worse. Against round 4: 1 gained, 0 lost. No loss on any field. Mini still names CONV_NEEDS_HUMAN on complaint calls and now records needs_human. Rs 0.052 per model-analysed call (+4% on current), about Rs 0.073-0.077 per 3-minute call [inference]",
  "n": 42, "method": "analysis-bench.ts --split test --model <gpt-4.1-mini> --prompt-variant r5-outcome-first, twice, through a harness copy (product/scripts/zz-r6-analysis-bench.ts) that differs from the product bench only in the DEV-only guard, letting through the one DEV winner named in BENCH_R6_TEST_ARM (harness/test-bench.diff; removed after the runs). " + SEL + " " + M,
  "path": f"{P}/README.md"},
 {"id": "measure.2026-10-24.analysis-bench-r6-outcome-first-tiered", "type": "measurement", "status": "measured", "date": "2026-10-24", "source": "verified",
  "title": "Analysis bench TEST, tiered (gpt-4.1-mini first, gpt-4.1 at threshold 0.6) on the r5-outcome-first contract, one pass, tree 839292d: outcome 42/42, objections 10/10, moments 36/36, commitments 10/10; escalated 0/39 (CI 0.0-9.0; round 5 on current: 2/39 each pass), so gpt-4.1 read nothing and the escalation path on this prompt is untested; 0 discordant against round 5 tiered p1 and p2 and against round 6 mini p1 and p2. Rs 0.052 per model-analysed call, the same as mini single; about Rs 0.073-0.077 per 3-minute call [inference], inside the Rs 0.17 budget",
  "n": 42, "method": "analysis-bench.ts --split test --model <gpt-4.1-mini> --escalate-model <gpt-4.1> --threshold 0.6 --prompt-variant r5-outcome-first, once, both deployments priced, through the same harness copy as the mini TEST runs; the one system prompt serves both passes of a call. Escalation reasons read from the run database (25 calls had an outcome at confidence >= 0.9; 11 engine-decided; 3 no-decision codes). " + M,
  "path": f"{P}/README.md"},
 {"id": "measure.2026-10-24.analysis-objection-recall-r6-mini-first", "type": "measurement", "status": "measured", "date": "2026-10-24", "source": "verified",
  "title": "Objection recall over round 6's mini-first analysis runs on the r5-outcome-first contract (DEV p1, p2; TEST mini p1, p2; tiered): 52/52 (round 5 on current 51/51, round 4 43/51); no escalation, so every pair is mini's own record. The pre-registered bar (>= 51/52) is met",
  "n": 52, "method": "(run, call) pairs of the 5 mini-first runs, each objection call has exactly one objection moment; per-call recall = 'objection' among the stored moment kinds; harness/stats.py (miniFirstObjections) over research/2026-10-24/benches-r6 JSONs.",
  "path": f"{P}/comparison.json"},
 {"id": "rejected.2026-10-24.analysis-contract-short-objection", "type": "rejection", "status": "rejected", "date": "2026-10-24", "source": "verified",
  "title": "95339a6's r5-short-objection analysis contract (the old KIND header plus a one-clause objection line) on gpt-4.1-mini single: it brings back the round-4 objection loss on complain-then-agree calls and keeps the complaint false nulls",
  "tried": "calls/analysis.ts PROMPT_VARIANTS r5-short-objection: 'KIND (one entry per line that shows it):' and '- objection: PERSON gives a reason against, or a complaint, also when they agree later', with the b1a80cf outcome table kept. DEV, two passes, tree 839292d.",
  "broke": "DEV p1: objections 9/11 (objection_resolved.lending and .telecom missed, the round-4 shape), moments 34/36, so it fails the pre-registered floors; complaint template 1/3 and 2/3 (false nulls), outcome 40 and 41. p2 was 11/11, so the loss is intermittent across passes, as it was in round 4."},
 {"id": "rejected.2026-10-24.analysis-contract-moment-not-outcome", "type": "rejection", "status": "rejected", "date": "2026-10-24", "source": "verified",
  "title": "95339a6's r5-moment-not-outcome analysis contract (current plus a line saying a moment never decides or blocks the OUTCOME) on gpt-4.1-mini single: it keeps objections but does not remove the false nulls that moving the OUTCOME block removes",
  "tried": "calls/analysis.ts PROMPT_VARIANTS r5-moment-not-outcome: current plus '- a moment never decides or blocks the OUTCOME: a complaint that asks for a human is an objection AND the needs-human VALUE' at the end of the OUTCOME block. DEV, two passes, tree 839292d.",
  "broke": "Outcome 41 and 41 (mean 41.0, below r5-outcome-first's 42.0): false nulls on complaint.healthcare (p1) and wrong_person.healthcare (p2), 2 of 12 complaint/wrong_person pairs against outcome-first's 0 and current's 3; +27 input tokens per call. The added line names a value of the bench's outcome definition ('needs-human VALUE') [inference: inert or misleading where a workspace's definition has no such value]."},
 {"id": "open.2026-10-24.analysis-outcome-first-second-round", "type": "open-question", "status": "open", "date": "2026-10-24", "source": "model",
  "title": "Does gpt-4.1-mini single on the OUTCOME-before-KIND contract match tiered again in a second round? Round 6 is the first round in which a mini-single contract matched tiered (42.0 vs 42 on TEST, no moment or objection loss); decision.2026-10-24.analysis-default-tiered reverses only after two consecutive rounds",
  "closes_when": "Round 7, on the contract as shipped: two TEST passes each of gpt-4.1-mini single and tiered. Mini within 1/42 of tiered on the mean with no moment or objection loss meets the reverse_if; otherwise tiered stands and the round-6 result is logged as variance."},
 {"id": "open.2026-10-24.analysis-outcome-first-client-rule", "type": "open-question", "status": "open", "date": "2026-10-24", "source": "model",
  "title": "In the r5-outcome-first arm the OUTCOME block moves before KIND, but a workspace's 'OUTCOME, client rule: ...' line stays after CODE, two blocks away from the outcome rules it qualifies; the no-question prompt's 'OUTCOME: always null.' also moves. The bench sets no client rule and always has a question, so neither is measured [inference: move the client rule with the OUTCOME block when the arm ships]",
  "closes_when": "The shipped contract keeps the client-rule line inside the OUTCOME block, and a bench run with a judge_version client rule (or a test that pins the line order) shows no outcome, objection or moment loss against round 6."},
]
E = lambda f, t, r: {'from': f, 'to': t, 'relation': r}
DEV, MINI, TIER, OBJ = ('measure.2026-10-24.analysis-bench-r6-dev-arms', 'measure.2026-10-24.analysis-bench-r6-outcome-first-mini',
                        'measure.2026-10-24.analysis-bench-r6-outcome-first-tiered', 'measure.2026-10-24.analysis-objection-recall-r6-mini-first')
RSHORT, RMOM = 'rejected.2026-10-24.analysis-contract-short-objection', 'rejected.2026-10-24.analysis-contract-moment-not-outcome'
O7, OCR = 'open.2026-10-24.analysis-outcome-first-second-round', 'open.2026-10-24.analysis-outcome-first-client-rule'
R5DEV, R5MINI, R5TIER, R5G41 = ('measure.2026-10-24.analysis-bench-r5-dev-ablation', 'measure.2026-10-24.analysis-bench-r5-gpt-4.1-mini',
                                'measure.2026-10-24.analysis-bench-r5-tiered', 'measure.2026-10-24.analysis-bench-r5-gpt-4.1')
R5OBJ = 'measure.2026-10-24.analysis-objection-recall-r5-mini-first'
TIERED, FIX = 'decision.2026-10-24.analysis-default-tiered', 'decision.2026-10-24.objection-always-a-moment'
R5REJ, OPEN5 = 'rejected.2026-10-24.objection-contract-mini-false-nulls', 'open.2026-10-24.analysis-contract-objections-and-outcome'
edges = [
 # round 5 -> round 6
 E(DEV, R5DEV, 'extends'),
 E(MINI, R5MINI, 'extends'), E(MINI, 'measure.2026-10-24.analysis-bench-r4-gpt-4.1-mini', 'extends'),
 E(TIER, R5TIER, 'extends'),
 E(TIER, R5G41, 'derived-from'),          # the re-based 3-minute cost uses round 5's gpt-4.1 output tokens per call
 E(OBJ, R5OBJ, 'extends'),
 E(OBJ, DEV, 'derived-from'), E(OBJ, MINI, 'derived-from'), E(OBJ, TIER, 'derived-from'),
 E(MINI, DEV, 'derived-from'), E(TIER, DEV, 'derived-from'),
 # the contract questions
 E(DEV, R5REJ, 'tests'), E(MINI, R5REJ, 'informs'),
 E(DEV, FIX, 'tests'), E(OBJ, FIX, 'supports'), E(MINI, FIX, 'supports'),
 E(MINI, OPEN5, 'answers'), E(DEV, OPEN5, 'tests'), E(OBJ, OPEN5, 'tests'),
 # the default decision
 E(MINI, TIERED, 'tests'), E(TIER, TIERED, 'tests'),
 E(TIER, 'decision.2026-10-24.analysis-default-tiered-in-code', 'tests'),
 # rejections
 E(RSHORT, DEV, 'derived-from'), E(RSHORT, FIX, 'supports'),
 E(RSHORT, 'rejected.2026-10-24.analysis-outcome-shapes-mini-drops-objections', 'extends'),
 E(RMOM, DEV, 'derived-from'), E(RMOM, R5REJ, 'extends'),
 # open questions
 E(O7, MINI, 'informed-by'), E(O7, TIER, 'informed-by'), E(O7, TIERED, 'tests'),
 E(OCR, MINI, 'informed-by'), E(OCR, 'component.product.calls-module', 'informs'),
] + [E(m, 'component.product.calls-module', 'tests') for m in (DEV, MINI, TIER)] \
  + [E(m, 'component.product.analysis-bench', 'derived-from') for m in (DEV, MINI, TIER)]
events = [{"date": "2026-10-24", "event": "benches-r6-analysis-contract-arms",
  "details": "Round 6, analysis only, tree 839292d (95339a6's arms): DEV two passes per arm on gpt-4.1-mini single, winner chosen by a rule written before the first request: current 41, 40; r5-short-objection 40, 41 (objections 9/11 on p1: not eligible); r5-outcome-first 42, 42 (objections 11/11, moments 36/36 both); r5-moment-not-outcome 41, 41. Winner r5-outcome-first (current's lines, OUTCOME before KIND). TEST: mini single 42/42 and 42/42 (round 5 current 38, 39; complaint + wrong_person 12/12, round 5 5/12; objections 10/10 both; pooled vs round 5 7 gained 0 lost, p = 0.0156 exploratory), tiered 42/42 with 0/39 escalated. Mini-first objections 52/52. All pre-registered replace criteria met; decision.2026-10-24.analysis-default-tiered stands (first of two rounds needed). TEST of a non-current arm ran through a one-line harness copy of the bench guard, removed after. Sequential, at most 1 request a second. Rs 23.91 at list prices (cap Rs 60), 0 HTTP errors, 0 429s. Results in research/2026-10-24/benches-r6/."}]
proposed = [{"id": OPEN5, "status": "closed",
             "why": "closes_when met on TEST, round 6 (r5-outcome-first): mini single mean 42.0 >= 41, no complaint/wrong_person false null in 12 pairs, objections 10/10 both passes, mini-first objections 52/52 (>= 51/52). See measure.2026-10-24.analysis-bench-r6-outcome-first-mini."}]
json.dump({'nodes': nodes, 'edges': edges, 'events': events, 'proposedStatusChanges': proposed}, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(len(nodes), len(edges), OUT)
