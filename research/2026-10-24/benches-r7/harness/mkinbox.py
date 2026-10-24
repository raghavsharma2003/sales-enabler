#!/usr/bin/env python3
# r7: writes context/inbox/main-2026-10-24-benches-r7.json (nodes, edges, one event) in the bench worktree, in the shape of
# r6's (research/2026-10-24/benches-r6/harness/mkinbox.py). The integrator merges it. Numbers are read from
# research/2026-10-24/benches-r7/comparison.json and db-reads.json, and the titles are asserted against them, so a title
# cannot drift from the data. The merge tool cannot change an existing node's status, so the proposed closure of
# open.2026-10-24.analysis-outcome-first-second-round (carried by a 'resolves' edge) and the supersession of
# decision.2026-10-24.analysis-default-tiered (carried by a 'supersedes' edge) are listed under proposedStatusChanges.
import json, sys
W = '/dev/shm/wt-bench7'
P = 'research/2026-10-24/benches-r7'
OUT = sys.argv[1] if len(sys.argv) > 1 else f'{W}/context/inbox/main-2026-10-24-benches-r7.json'
C = json.load(open(f'{W}/{P}/comparison.json'))
DB = json.load(open(f'{W}/{P}/db-reads.json'))
A = C['analysis']; MI = A['gpt-4.1-mini']; TI = A['tiered']; MT = A['miniVsTiered']; REP = A['vsEarlierRounds']
PS = ('p1', 'p2')
mk = lambda k: [MI[p]['metrics'][k] for p in PS]
tk = lambda k: [TI[p]['metrics'][k] for p in PS]
disc = lambda x: len(x['aOnly']) + len(x['bOnly'])
# ---- the numbers the titles state, checked against comparison.json and db-reads.json
assert C['tree'] == '6d69a85febaf9f605ccf8178ab99ad245ec1b03f' and C['promptVariant'] == 'current'
assert mk('outcomeK') == [42, 42] and mk('objectionK') == [10, 10] and mk('momentK') == [36, 36] and mk('commitmentK') == [10, 10]
assert mk('allMomentsK') == [42, 42] and mk('crisisK') == [42, 42] and mk('groundedK') == [117, 115] and mk('groundedN') == [117, 115]
assert MI['meanOfPasses']['outcomeMean'] == 42.0 and 'CI 91.6-100.0' in MI['meanOfPasses']['outcome']
assert MI['templatesPooled'] == {'complaint': '6/6', 'wrong_person': '6/6'} and MI['passToPass']['any'] == 0
assert tk('outcomeK') == [42, 42] and tk('objectionK') == [10, 10] and tk('momentK') == [36, 36] and tk('commitmentK') == [10, 10]
assert tk('crisisK') == [42, 42] and tk('groundedK') == [118, 115] and TI['passToPass']['any'] == 0 and TI['templatesPooled'] == {'complaint': '6/6', 'wrong_person': '6/6'}
E = {p: TI[p]['escalation'] for p in PS}
assert all(E[p]['escalated'] == 0 and E[p]['analysed'] == 39 for p in PS)
assert all(E[p]['whyAll42'] == {'null': 25, "the engine decided this call's reason; it is never escalated": 11,
                                 'the first pass found a reason on which no outcome is recorded; it is never escalated': 3, 'not analysed by the model': 3} for p in PS)
assert all(len(TI[p]['escalation']['byModel']) == 1 and 'mini' in TI[p]['escalation']['byModel'][0]['model'] for p in PS)
assert all(v['outcomeConfidence']['min'] == 0.9 and v['outcomeConfidence']['below0.6'] == 0 and v['outcomeConfidence']['callsWithOutcome'] == 30 for v in DB.values())
assert all(not v['misses'] and not v['momentOrCrisisMisses'] and v['allMappedAndMatched'] for v in DB.values()) and len(DB) == 4
for k in ('samePass_p1', 'samePass_p2', 'crossed_tieredp2_minip1', 'crossed_tieredp1_minip2'):
    assert all(disc(MT[k][f]) == 0 and MT[k][f]['p'] == 1.0 for f in ('outcome', 'allMoments', 'objectionPerCall', 'commitments')), k
assert MT['pooled_exploratory']['n'] == 84 and disc(MT['pooled_exploratory']) == 0
assert MT['anyField_samePass_p1']['any'] == 0 and MT['anyField_samePass_p2']['any'] == 0
for p in PS:
    assert REP[f'mini_{p}_anyField_vs_r6mini_{p}']['any'] == 0 and REP[f'tiered_{p}_anyField_vs_r6tiered_p1']['any'] == 0
assert [len(REP[f'mini_{p}_vs_r5mini_{p}_previousContract']['outcome']['bOnly']) for p in PS] == [4, 3]
assert A['earlier'] == {'r6_mini': [42, 42], 'r6_tiered': [42], 'r5_mini': [38, 39], 'r5_tiered': [42, 42]}
R = A['rule']; RV = A['reverseIf_analysis-default-tiered']
assert R['matches'] and not R['failedClauses'] and RV['twoConsecutiveRounds'] and RV['met'] and RV['agreesWithRule']
assert not RV['costOver017']['a'] and not RV['costOver017']['b']
assert A['cost3min']['tiered'] == {'e_pooledTwoPasses': 0.0, 'a': 0.073, 'b': 0.0768} and A['cost3min']['model_b_rebased']['gpt-4.1-mini'] == 0.0768
assert A['costPerModelAnalysedCall'] == {'mini-p1': 0.0519, 'mini-p2': 0.0515, 'tiered-p1': 0.0521, 'tiered-p2': 0.0514}
assert A['miniFirstObjections']['text'] == '40/40'
S = C['spend']
assert S['total'] == {'requests': 160, 'inr': 8.7, 'httpErrors': 0, 'retries429': 0, 'networkErrors': 0, 'refusedByCap': 0}
assert [S['byRun'][r]['inr'] for r in ('analysis-gpt-4.1-mini.current-p1', 'analysis-tiered.current-p1', 'analysis-gpt-4.1-mini.current-p2', 'analysis-tiered.current-p2')] == [2.21, 2.19, 2.15, 2.15]

M = ("Through round 6's harness (research/2026-10-24/benches-r6/harness, copied with paths changed; azure-guard.mjs byte-identical "
     "to round 1's): private tmpfs Postgres, a fresh migrated DB per run (each pass its own process), its own ledger, global cap Rs 40, "
     "strictly sequential, at most 1 request a second (guard gap 1.5 s), crisis judge off. Order mini p1, tiered p1, mini p2, tiered p2 "
     "(round 5's interleave). Tree 6d69a85 (contains 6245d4e; detached). Contract gate passed before any request: "
     "product/scripts/analysis-variant-probe.ts, shipped 'current' prompt byte-identical to "
     "product/scripts/analysis-bench/contracts/r6-outcome-first.bench.txt (sha256 ba7656b7...642fbb). analysis-bench.ts, cases.ts and "
     "llm.ts unchanged since r6's tree 839292d; DEV/TEST split byte-identical to r6's. Scored by code against hand-written keys; every "
     "run database read back (harness/misses.py, db-reads.json): stored outcome, reason code and moment kinds match the bench JSON on "
     "42/42 calls in each run. Exact two-sided McNemar on the same ids.")
MINI7, TIER7, CMP7 = ('measure.2026-10-24.analysis-bench-r7-mini', 'measure.2026-10-24.analysis-bench-r7-tiered',
                      'measure.2026-10-24.analysis-bench-r7-mini-vs-tiered')
NEWDEC, OESC = 'decision.2026-10-24.analysis-default-mini-single-outcome-first', 'open.2026-10-24.analysis-escalation-path-unexercised'
OLDDEC, O7 = 'decision.2026-10-24.analysis-default-tiered', 'open.2026-10-24.analysis-outcome-first-second-round'
R6MINI, R6TIER = 'measure.2026-10-24.analysis-bench-r6-outcome-first-mini', 'measure.2026-10-24.analysis-bench-r6-outcome-first-tiered'
R5TIER, SHIPPED = 'measure.2026-10-24.analysis-bench-r5-tiered', 'decision.2026-10-24.analysis-contract-outcome-first-shipped'
INCODE, FIX = 'decision.2026-10-24.analysis-default-tiered-in-code', 'decision.2026-10-24.objection-always-a-moment'

nodes = [
 {"id": MINI7, "type": "measurement", "status": "measured", "date": "2026-10-24", "source": "verified",
  "title": "Analysis bench TEST (42 calls), gpt-4.1-mini single on the shipped outcome-first contract (prompt variant current, byte-identical to round 6's measured prompt), two passes, tree 6d69a85: outcome 42/42 and 42/42 (mean 42.0, CI 91.6-100), objections 10/10, moments 36/36, commitments 10/10, every moment 42/42, crisis 42/42, grounded quotes 117/117 and 115/115 both passes; complaint 6/6 and wrong_person 6/6; 0/42 pass-to-pass disagreement on any field; 0 discordant on any field against round 6's two mini passes (same prompt bytes). Rs 0.0519 and 0.0515 per model-analysed call; Rs 2.21 and 2.15 per run",
  "n": 42, "method": "analysis-bench.ts --split test --model <gpt-4.1-mini> --prompt-variant current, twice (the product bench, unchanged; --model pins single). " + M,
  "path": f"{P}/README.md"},
 {"id": TIER7, "type": "measurement", "status": "measured", "date": "2026-10-24", "source": "verified",
  "title": "Analysis bench TEST, tiered (gpt-4.1-mini first, gpt-4.1 at threshold 0.6) on the shipped outcome-first contract, two passes, tree 6d69a85: outcome 42/42 and 42/42, objections 10/10, moments 36/36, commitments 10/10, crisis 42/42 both; escalated 0/39 in each pass (0 gpt-4.1 requests; with round 6, 0/117 analysed TEST calls on this contract): 25 calls had an outcome at confidence >= 0.9 (minimum 0.9 in the run databases), 11 engine-decided, 3 no-decision codes. 0 discordant on any field against round 6's tiered pass. Rs 0.0521 and 0.0514 per model-analysed call, all mini; Rs 2.19 and 2.15 per run",
  "n": 42, "method": "analysis-bench.ts --split test --model <gpt-4.1-mini> --escalate-model <gpt-4.1> --threshold 0.6 --prompt-variant current, twice, both deployments priced (the per-call cost priced per model from the bench's cost lines). Escalation reasons from the bench items' tier records; confidences read from each run database. " + M,
  "path": f"{P}/README.md"},
 {"id": CMP7, "type": "measurement", "status": "measured", "date": "2026-10-24", "source": "verified",
  "title": "Round 7's pre-registered rule (harness/rule.txt): gpt-4.1-mini single MATCHES tiered on the shipped outcome-first contract. TEST outcome 42 vs 42 on each pass (rule: mini >= tiered - 1), objections 10 vs 10, moments 36 vs 36, commitments 10 vs 10 on each pass, crisis 0 errors. Exact McNemar mini vs tiered: 0 discordant on outcome, objections, every moment and commitments, same pass and crossed (p = 1.0), pooled 0 of 84 pairs; 0/42 any-field disagreement on each same-pass pair. With round 6 (42.0 vs 42) this is the second consecutive matching round, so decision.2026-10-24.analysis-default-tiered's reverse_if is met (its cost clause is not: tiered Rs 0.073-0.077 per 3-minute call). Tiered never escalated, so every tiered request was mini's: the match does not test the escalation path",
  "n": 42, "method": "harness/stats.py over the four r7 bench JSONs: per-pass counts, exact two-sided McNemar on the same 42 TEST ids (tiered as a, mini as b; same pass, crossed, and (pass, call) pairs pooled [exploratory]), any-field disagreement (outcome value, reason code, moment set). The rule was written before the first request (rule.txt mtime 06:41:00 UTC; first ledger request 06:41:32 UTC; the ledger did not exist before). Rule: mini >= tiered - 1 on outcome on both passes; objections, moments, commitments >= tiered on both passes; crisis 42/42 on both mini passes. The decision's reverse_if (within 1/42 on the mean) is implied by the rule's outcome clause and was read too: it agrees.",
  "path": f"{P}/comparison.json"},
 {"id": OESC, "type": "open-question", "status": "open", "date": "2026-10-24", "source": "model",
  "title": "On the outcome-first contract tiered's escalation path has not fired on the bench (0/117 analysed TEST calls over rounds 6-7; every recorded outcome at confidence >= 0.9, threshold 0.6): what does tiered add over gpt-4.1-mini single on calls where the first pass is unsure or finds no outcome, and how often are such calls on real traffic?",
  "closes_when": "A slice on which the first pass actually escalates (consented real-traffic calls, or a synthetic hard-case set pre-registered before its first request: ambiguous or hedged outcomes, mixed language, long calls) runs gpt-4.1-mini single against tiered, two passes each. Tiered better by 2 or more calls per 42 or with exact McNemar p < 0.05 reopens the analysis default; otherwise mini single stands. The escalation rate on real traffic is logged with n."},
 {"id": NEWDEC, "type": "decision", "status": "proposed", "date": "2026-10-24", "source": "model",
  "title": "Per-call analysis defaults to gpt-4.1-mini single on the shipped outcome-first contract; tiered (mini first, gpt-4.1 at threshold 0.6) and gpt-4.1 stay selectable. Proposed by bench round 7's pre-registered rule; the code default (defaultAnalysisSetting, decision.2026-10-24.analysis-default-tiered-in-code) changes only when the integrator adopts this",
  "rationale": "decision.2026-10-24.analysis-default-tiered's reverse_if is met: on the shipped contract, mini single matched tiered on TEST in two consecutive rounds (round 6: 42, 42 vs 42; round 7: 42, 42 vs 42, 42) with no outcome, objection, moment, commitment or crisis loss and 0 discordant pairs on any field. Round 7's rule, written before its first request, recommends the cheaper option on a match. What bounds this: tiered escalated 0/117 analysed calls over rounds 6-7, so on the bench its requests were mini's, and it cost the same (Rs 0.0514-0.0521 per model-analysed call against mini's 0.0515-0.0519). The saving, and any quality tiered adds, exist only on calls where the first pass is unsure or finds no outcome, which this bench no longer contains (open.2026-10-24.analysis-escalation-path-unexercised). On earlier contracts tiered did catch mini's false nulls (rounds 3-5: 250/252 vs 234/252); outcome-first removed them on this bench (complaint and wrong-person 24/24 (pass, call) pairs over rounds 6-7).",
  "reverse_if": "On the shipped contract, a TEST round in which mini single is more than 1 call below tiered on either pass, or loses an objection, moment or commitment against it; or a slice on which tiered actually escalates (real traffic or a pre-registered hard-case set) where tiered beats mini single by 2 or more calls per 42 or with exact McNemar p < 0.05; or a contract change that brings back mini's complaint or wrong-person false nulls."},
]
Ed = lambda f, t, r: {'from': f, 'to': t, 'relation': r}
edges = [
 # round 6 -> round 7
 Ed(MINI7, R6MINI, 'extends'), Ed(TIER7, R6TIER, 'extends'), Ed(TIER7, R5TIER, 'extends'),
 Ed(CMP7, MINI7, 'derived-from'), Ed(CMP7, TIER7, 'derived-from'),
 # the open question this round was run for
 Ed(CMP7, O7, 'resolves'), Ed(MINI7, O7, 'tests'), Ed(TIER7, O7, 'tests'),
 # the default decision
 Ed(CMP7, OLDDEC, 'tests'), Ed(MINI7, OLDDEC, 'tests'), Ed(TIER7, OLDDEC, 'tests'),
 Ed(NEWDEC, OLDDEC, 'supersedes'),
 Ed(NEWDEC, CMP7, 'derived-from'), Ed(NEWDEC, MINI7, 'derived-from'), Ed(NEWDEC, TIER7, 'derived-from'), Ed(NEWDEC, R6MINI, 'derived-from'),
 Ed(NEWDEC, SHIPPED, 'requires'), Ed(NEWDEC, INCODE, 'informs'), Ed(NEWDEC, OESC, 'leaves-open'),
 # the shipped contract and the objection rule
 Ed(MINI7, SHIPPED, 'tests'), Ed(MINI7, SHIPPED, 'supports'), Ed(MINI7, FIX, 'supports'),
 # the escalation path
 Ed(OESC, TIER7, 'informed-by'), Ed(OESC, R6TIER, 'informed-by'), Ed(OESC, 'rejected.harvest.02', 'informed-by'),
 Ed(OESC, 'component.product.calls-module', 'informs'),
] + [Ed(m, 'component.product.calls-module', 'tests') for m in (MINI7, TIER7, CMP7)] \
  + [Ed(m, 'component.product.analysis-bench', 'derived-from') for m in (MINI7, TIER7, CMP7)]
events = [{"date": "2026-10-24", "event": "benches-r7-analysis-mini-vs-tiered",
  "details": "Round 7, analysis only, tree 6d69a85 (contains 6245d4e; the shipped outcome-first contract passed its byte-identity gate before any request): TEST, two passes each, interleaved, of gpt-4.1-mini single and tiered (mini first, gpt-4.1 at 0.6), under a rule written before the first request. Mini 42/42 and 42/42, tiered 42/42 and 42/42; objections 10/10, moments 36/36, commitments 10/10, crisis 42/42 in every run; 0 discordant pairs on any field between the arms, between passes, and against round 6. Tiered escalated 0/39 per pass (no gpt-4.1 request; every recorded outcome at confidence >= 0.9). The rule MATCHES; with round 6 that is two consecutive rounds, so decision.2026-10-24.analysis-default-tiered's reverse_if is met and mini single as the default is proposed, tiered selectable. The escalation path stays unexercised on this contract (new open question). Sequential, at most 1 request a second. Rs 8.70 at list prices (cap Rs 40), 160 requests, 0 HTTP errors, 0 429s. Results in research/2026-10-24/benches-r7/."}]
proposed = [
 {"id": O7, "status": "closed",
  "why": "closes_when met in round 7 on the shipped contract: two TEST passes each, mini single 42, 42 against tiered 42, 42 (within 1/42 on the mean and on each pass), no moment or objection loss. See measure.2026-10-24.analysis-bench-r7-mini-vs-tiered."},
 {"id": OLDDEC, "status": "superseded",
  "why": "Only if the integrator adopts decision.2026-10-24.analysis-default-mini-single-outcome-first: its reverse_if (two consecutive matching rounds) is met by rounds 6 and 7."},
]
json.dump({'nodes': nodes, 'edges': edges, 'events': events, 'proposedStatusChanges': proposed}, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(len(nodes), len(edges), OUT)
