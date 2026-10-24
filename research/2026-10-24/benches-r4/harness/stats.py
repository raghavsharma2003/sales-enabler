#!/usr/bin/env python3
# r4 comparison stats (r4 version of research/2026-10-23/benches-r3/harness/stats.py; the same wilson, mcnemar, amet and
# disagree). Wilson 95% CIs; exact two-sided McNemar on paired items; round 3 -> round 4 on the same ids.
# Analysis: DEV r3 -> r4; two TEST passes per design (p1, p2): each r4 pass against the same-numbered r3 pass (and the
# cross pairings), pass-to-pass disagreement, mean of the passes, design against design per pass, tiered's escalations,
# the 3-minute cost, and the reverse_if of decision.2026-10-23.analysis-default-mini-single.
# Operator: strict r3 -> r4 per model on the same task ids, per category, not_measured apart, mini vs gpt-4.1, the
# claim check and NOT DONE follow-ups (from opdb.py's per-run DB reports), and the reverse_if of
# decision.2026-10-24.operator-default-gpt41. Reads only the scrubbed bench JSONs in the worktree and the opdb reports.
# Prints JSON to stdout.
import json, math, os, sys, collections
R3 = '/dev/shm/wt-bench4/research/2026-10-23/benches-r3'
R4 = '/dev/shm/wt-bench4/research/2026-10-24/benches-r4'
T = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r4'
SPLITS = json.load(open(f'{T}/splits.json'))
PASSES = ('p1', 'p2')
MODELS = ('gpt-4.1-mini', 'gpt-4.1')

def wilson(k, n, z=1.959964):
    if not n: return (0.0, 0.0)
    p = k / n; d = 1 + z * z / n; c = p + z * z / (2 * n); m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (max(0.0, (c - m) / d), min(1.0, (c + m) / d))

def fmt(k, n):
    lo, hi = wilson(k, n)
    return f"{k:g}/{n}, {100*k/n:.1f}% (CI {100*lo:.1f}-{100*hi:.1f})" if n else '0/0'

def mcnemar(a, b):
    """a, b: dict id -> bool. Exact two-sided McNemar on discordant pairs over common ids. aOnly = right in a only."""
    ids = sorted(set(a) & set(b))
    bwin = [i for i in ids if b[i] and not a[i]]; awin = [i for i in ids if a[i] and not b[i]]
    n = len(bwin) + len(awin); k = min(len(bwin), len(awin))
    p = 1.0 if n == 0 else min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)
    return {'n': len(ids), 'aOnly': awin, 'bOnly': bwin, 'p': round(p, 4)}

def load(p):
    return json.load(open(p)) if os.path.exists(p) else None

out = {'tree': '8e3440ae6e4c21e6433294c63a2c8548da6a889a', 'baseline': 'round 3, tree cd94b63 (research/2026-10-23/benches-r3)'}

# ---------------- Operator
STOPS = ('provider_refused', 'llm_error')
def strict(tasks):
    """A pass needs the grader's pass, a model that was reached and no provider stop. not_measured / not_run: False."""
    return {t['id']: t['status'] == 'pass' and t['reachedModel'] and t.get('stoppedBy') not in STOPS for t in tasks}

CLAIM_TASKS = ('edit-fact', 'multi-deploy', 'edit-duration', 'multi-template-limits', 'edit-hindi')
op = {}; s4 = {}; s3 = {}
for m in MODELS:
    r3, r4 = load(f'{R3}/operator-{m}.json'), load(f'{R4}/operator-{m}.json')
    if not r4: continue
    t4 = r4['tasks']
    nm = [t['id'] for t in t4 if t['status'] == 'not_measured']
    nr = [t['id'] for t in t4 if t['status'] == 'not_run']
    a4 = strict(t4); a3 = strict(r3['tasks']); s4[m], s3[m] = a4, a3
    measured = [t for t in t4 if t['status'] not in ('not_measured', 'not_run')]
    asGraded = sum(t['status'] == 'pass' for t in measured)
    assert asGraded == sum(a4[t['id']] for t in measured), 'r4 as graded differs from strict on measured tasks'
    cat_of = {t['id']: t['category'] for t in t4}
    cats = list(dict.fromkeys(t['category'] for t in t4))
    bycat = {}
    for c in cats:
        a = {k: v for k, v in a3.items() if cat_of.get(k) == c}; b = {k: v for k, v in a4.items() if cat_of.get(k) == c}
        nmc = [k for k in nm if cat_of[k] == c]
        bycat[c] = {'r3': f'{sum(a.values())}/{len(a)}', 'r4': f'{sum(b.values())}/{len(b)}',
                    'r4_measured': f"{sum(b[k] for k in b if k not in nm)}/{len(b) - len(nmc)}", 'notMeasured': nmc, **mcnemar(a, b)}
    led = r4['harness']
    reached = [t for t in measured if t['reachedModel']]
    op[m] = {
        'strict_of48': fmt(sum(a4.values()), len(t4)),
        'strict_ofMeasured': fmt(sum(a4[t['id']] for t in measured), len(measured)),
        'asGraded': f"{r4['summary']['passed']}/{r4['summary']['run']}",
        'notMeasured': nm, 'notRun': nr,
        'notMeasuredWhy': {t['id']: t['why'] for t in t4 if t['status'] == 'not_measured'},
        'r3strict_of48': fmt(sum(a3.values()), len(a3)),
        'mcnemar_r3_vs_r4_strict_all48': mcnemar(a3, a4),
        'mcnemar_r3_vs_r4_strict_measuredOnly': mcnemar({k: v for k, v in a3.items() if k not in nm}, {k: v for k, v in a4.items() if k not in nm}),
        'byCategoryStrict': {c: v['r4'] for c, v in bycat.items()},
        'byCategoryCI_measured': {c: fmt(sum(a4[t['id']] for t in measured if t['category'] == c), sum(1 for t in measured if t['category'] == c)) for c in cats},
        'mcnemar_r3_vs_r4_byCategory_strict': bycat,
        'claimTasks': {k: {'r3': a3.get(k), 'r4': a4.get(k), 'why': next(t['why'] for t in t4 if t['id'] == k)[:240]} for k in CLAIM_TASKS},
        'reachedCount': f'{len(reached)}/{len(measured)} measured',
        'errors': [t['id'] for t in t4 if t['status'] == 'error'],
        'tokens': r4['summary']['tokens'], 'benchInr': (r4['summary']['inrMilli'] or 0) / 1000,
        'ledger': {k: v for k, v in led.items() if k != 'httpErrorDetails'}, 'httpErrorDetails': led.get('httpErrorDetails'),
        'inrPerTask_ledger': round(led['inr'] / len(t4), 3),
        'inrPerStrictPass_ledger': round(led['inr'] / max(1, sum(a4.values())), 3),
        'wallS': round(r4['summary']['wallMs'] / 1000),
        'meanLlmCalls_reached': round(sum(t['llmCalls'] for t in reached) / max(1, len(reached)), 2),
        'meanTokens_reached': round(sum(t['tokens']['input'] + t['tokens']['output'] for t in reached) / max(1, len(reached))),
        'meanToolCalls_reached': round(sum(t['toolCalls'] for t in reached) / max(1, len(reached)), 2),
        'r3_meanLlmCalls_reached': round(sum(t['llmCalls'] for t in r3['tasks'] if t['reachedModel']) / max(1, sum(1 for t in r3['tasks'] if t['reachedModel'])), 2),
        'r3_meanTokens_reached': round(sum(t['tokens']['input'] + t['tokens']['output'] for t in r3['tasks'] if t['reachedModel']) / max(1, sum(1 for t in r3['tasks'] if t['reachedModel']))),
        'findTools_total': sum(t['findTools'] for t in t4),
        'findTools_tasks': [(t['id'], t['findTools'], t['status']) for t in t4 if t['findTools']],
        'stoppedBy': dict(collections.Counter(t.get('stoppedBy') for t in t4 if t.get('stoppedBy'))),
        'stoppedByTasks': {t['id']: t.get('stoppedBy') for t in t4 if t.get('stoppedBy')},
        'fails': [(t['id'], t['category'], t['llmCalls'], t['toolCalls'], t['why'][:240]) for t in t4 if t['status'] not in ('pass', 'not_measured')],
        'gained': [i for i in a4 if a4[i] and not a3.get(i, False)],
        'lost': [i for i in a4 if not a4[i] and a3.get(i, False)],
    }
    db = load(f'{T}/opdb-{m}.json')
    if db: op[m]['db'] = db['summary']
if len(s4) == 2:
    op['mcnemar_r4_mini_vs_41'] = mcnemar(s4['gpt-4.1-mini'], s4['gpt-4.1'])
    op['mcnemar_r3_mini_vs_41'] = mcnemar(s3['gpt-4.1-mini'], s3['gpt-4.1'])
    cat_of = {t['id']: t['category'] for t in load(f'{R4}/operator-gpt-4.1.json')['tasks']}
    pooled = {}
    groups = {c: [k for k in cat_of if cat_of[k] == c] for c in ('csv', 'campaign', 'template', 'refusal', 'multi')}
    groups['claimTasks'] = list(CLAIM_TASKS)
    groups['ref-human'] = ['ref-human']
    for g, ids in groups.items():
        a = {f'{m}:{k}': s3[m][k] for m in MODELS for k in ids}; b = {f'{m}:{k}': s4[m][k] for m in MODELS for k in ids}
        pooled[g] = {'r3': f'{sum(a.values())}/{len(a)}', 'r4': f'{sum(b.values())}/{len(b)}', **mcnemar(a, b)}
    op['pooled_r3_vs_r4_strict'] = pooled
    k41, km = sum(s4['gpt-4.1'].values()), sum(s4['gpt-4.1-mini'].values())
    op['reverseIf_operator_default_gpt41'] = {
        'rule': 'gpt-4.1-mini within 2/48 of gpt-4.1 strict on two runs of a round with the round-3 failures fixed, with no safety-relevant failure',
        'r4': {'gpt-4.1': k41, 'gpt-4.1-mini': km, 'gap': k41 - km, 'withinTwo': abs(k41 - km) <= 2 or km > k41},
        'runsInThisRound': 1}
out['operator'] = op

# ---------------- Analysis
def amet(items):
    it = items
    reasonOk = lambda x: x['predicted']['reasonCode'] in [x['key']['reasonCode']] + (x['key'].get('reasonAlt') or [])
    need = [(x, m['kind']) for x in it for m in x['key']['moments']]
    com = [(x, k) for x, k in need if k == 'commitment']
    obj = [(x, k) for x, k in need if k == 'objection']
    sameSet = lambda a, b: len(a) == len(b) and all(i in b for i in a)
    extra = collections.Counter(k for x in it for k in x['predicted']['moments'] if k not in [m['kind'] for m in x['key']['moments']])
    return {
        'n': len(it),
        'outcome': fmt(sum(x['predicted']['outcome'] == x['key']['outcome'] for x in it), len(it)),
        'outcomeK': sum(x['predicted']['outcome'] == x['key']['outcome'] for x in it),
        'reasonCode': fmt(sum(map(reasonOk, it)), len(it)),
        'momentRecall': fmt(sum(k in x['predicted']['moments'] for x, k in need), len(need)),
        'momentK': sum(k in x['predicted']['moments'] for x, k in need), 'momentN': len(need),
        'commitmentRecall': fmt(sum(k in x['predicted']['moments'] for x, k in com), len(com)),
        'commitmentK': sum(k in x['predicted']['moments'] for x, k in com), 'commitmentN': len(com),
        'objectionRecall': fmt(sum(k in x['predicted']['moments'] for x, k in obj), len(obj)),
        'objectionK': sum(k in x['predicted']['moments'] for x, k in obj), 'objectionN': len(obj),
        'allMomentsFound': fmt(sum(all(m['kind'] in x['predicted']['moments'] for m in x['key']['moments']) for x in it), len(it)),
        'allMomentsK': sum(all(m['kind'] in x['predicted']['moments'] for m in x['key']['moments']) for x in it),
        'followUps': fmt(sum(sameSet(x['predicted']['followUps'], x['key']['followUps']) for x in it), len(it)),
        'optOutRecallAnalysis': fmt(sum(x['predicted']['optOutAnalysis'] for x in it if x['key']['optOut']), sum(1 for x in it if x['key']['optOut'])),
        'optOutRecallFloor': fmt(sum(bool(x['predicted'].get('optOutFloor')) for x in it if x['key']['optOut']), sum(1 for x in it if x['key']['optOut'])),
        'grounding': fmt(sum(x['quotesProposed'] - x['quotesDropped'] for x in it), sum(x['quotesProposed'] for x in it)),
        'extraMomentKinds': dict(extra), 'extraMoments': sum(extra.values()),
        'outcomeMisses': dict(collections.Counter(f"{x['template']}: {x['key']['outcome']}->{x['predicted']['outcome']}" for x in it if x['predicted']['outcome'] != x['key']['outcome'])),
        'outcomeMissIds': [x['id'] for x in it if x['predicted']['outcome'] != x['key']['outcome']],
        'reasonMisses': [(x['id'], x['key']['reasonCode'], x['predicted']['reasonCode']) for x in it if not reasonOk(x)],
        'momentMisses': [(x['id'], [m['kind'] for m in x['key']['moments'] if m['kind'] not in x['predicted']['moments']]) for x in it
                         if any(m['kind'] not in x['predicted']['moments'] for m in x['key']['moments'])],
        'status': dict(collections.Counter(x['analysisStatus'] for x in it)),
    }

ok = lambda items: {x['id']: x['predicted']['outcome'] == x['key']['outcome'] for x in items}
allm = lambda items: {x['id']: all(m['kind'] in x['predicted']['moments'] for m in x['key']['moments']) for x in items}
comm = lambda items: {x['id']: all(m['kind'] in x['predicted']['moments'] for m in x['key']['moments'] if m['kind'] == 'commitment')
                      for x in items if any(m['kind'] == 'commitment' for m in x['key']['moments'])}

def disagree(a, b):
    A = {x['id']: x for x in a}; B = {x['id']: x for x in b}
    ids = sorted(set(A) & set(B))
    mset = lambda x: sorted(set(x['predicted']['moments']))
    oc = [i for i in ids if A[i]['predicted']['outcome'] != B[i]['predicted']['outcome']]
    rc = [i for i in ids if A[i]['predicted']['reasonCode'] != B[i]['predicted']['reasonCode']]
    ms = [i for i in ids if mset(A[i]) != mset(B[i])]
    sc = [i for i in ids if (A[i]['predicted']['outcome'] == A[i]['key']['outcome']) != (B[i]['predicted']['outcome'] == B[i]['key']['outcome'])]
    anyd = sorted(set(oc) | set(rc) | set(ms))
    return {'n': len(ids), 'outcomeValue': len(oc), 'outcomeValueIds': oc, 'outcomeScore': len(sc), 'outcomeScoreIds': sc,
            'reasonCode': len(rc), 'momentSet': len(ms), 'momentSetIds': ms, 'any': len(anyd), 'anyIds': anyd}

def perCallTokens(j):
    c = j.get('cost') or {}
    n = c.get('modelCalls') or 0
    return {'modelCalls': n, 'inPerCall': round(c['inputTokens'] / n, 1) if n else None, 'outPerCall': round(c['outputTokens'] / n, 1) if n else None}

an = {'dev': {}, 'test': {}}
dev4, dev3 = load(f'{R4}/analysis-dev-gpt-4.1-mini.json'), load(f'{R3}/analysis-dev-gpt-4.1-mini.json')
if dev4:
    an['dev']['r4_gpt-4.1-mini'] = amet(dev4['items'])
    an['dev']['r3_gpt-4.1-mini'] = amet(dev3['items'])
    an['dev']['mcnemar_outcome_r3_vs_r4'] = mcnemar(ok(dev3['items']), ok(dev4['items']))
    an['dev']['mcnemar_allMoments_r3_vs_r4'] = mcnemar(allm(dev3['items']), allm(dev4['items']))
    an['dev']['r3MissesNow'] = {i: next(x['predicted']['outcome'] for x in dev4['items'] if x['id'] == i) for i in amet(dev3['items'])['outcomeMissIds']}
    an['dev']['ledger'] = {k: v for k, v in dev4['harness'].items() if k != 'httpErrorDetails'}
    an['dev']['cost'] = dev4.get('cost'); an['dev']['tokens'] = {'r4': perCallTokens(dev4), 'r3': perCallTokens(dev3)}

items4, items3 = {}, {}
for m in ('gpt-4.1-mini', 'gpt-4.1', 'tiered'):
    e = {}
    for p in PASSES:
        r4, r3 = load(f'{R4}/analysis-{m}-{p}.json'), load(f'{R3}/analysis-{m}-{p}.json')
        if not r4: continue
        items4[(m, p)], items3[(m, p)] = r4['items'], r3['items']
        e[p] = {'metrics': amet(r4['items']), 'cost': r4.get('cost'), 'costTiered': r4.get('costTiered'), 'tier': r4.get('tier'),
                'tokens': {'r4': perCallTokens(r4), 'r3': perCallTokens(r3)},
                'cross': r4.get('cross'), 'ledger': {k: v for k, v in r4['harness'].items() if k != 'httpErrorDetails'},
                'httpErrorDetails': r4['harness'].get('httpErrorDetails'), 'truncated': r4.get('truncated'),
                'r3metrics': {k: amet(r3['items'])[k] for k in ('outcome', 'outcomeK', 'momentRecall', 'commitmentRecall', 'allMomentsFound', 'outcomeMisses')},
                'mcnemar_outcome_r3_vs_r4_samePass': mcnemar(ok(r3['items']), ok(r4['items'])),
                'mcnemar_allMoments_r3_vs_r4_samePass': mcnemar(allm(r3['items']), allm(r4['items'])),
                'mcnemar_commitment_r3_vs_r4_samePass': mcnemar(comm(r3['items']), comm(r4['items']))}
        other = 'p2' if p == 'p1' else 'p1'
        r3o = load(f'{R3}/analysis-{m}-{other}.json')
        e[p][f'mcnemar_outcome_r3{other}_vs_r4{p}'] = mcnemar(ok(r3o['items']), ok(r4['items']))
        if m == 'tiered':
            it = r4['items']
            esc = [x for x in it if x.get('tier') and x['tier']['escalated']]
            mini = load(f'{R4}/analysis-gpt-4.1-mini-{p}.json')
            M = {x['id']: x for x in mini['items']} if mini else {}
            def did(x):
                right = x['predicted']['outcome'] == x['key']['outcome']
                if x['tier']['why'] == 'no outcome':   # the first pass recorded no outcome: exact
                    if x['key']['outcome'] is None: return 'kept a right null' if right else 'broke a right null'
                    return 'fixed a wrong null' if right else 'still wrong'
                return ('right' if right else 'wrong') + ' (first pass not stored; mini single same pass: ' + str(M.get(x['id'], {}).get('predicted', {}).get('outcome')) + ')'
            e[p]['escalation'] = {'rate': fmt(len(esc), r4['tier']['calls']), 'escalated': len(esc), 'analysed': r4['tier']['calls'],
                                  'why': dict(collections.Counter(x['tier']['why'] for x in it if x.get('tier'))),
                                  'each': [(x['id'], x['template'], x['tier']['why'], 'key ' + str(x['key']['outcome']), 'final ' + str(x['predicted']['outcome']), did(x)) for x in esc],
                                  'did': dict(collections.Counter(did(x).split(' (')[0] for x in esc)),
                                  'secondFailed': r4['tier'].get('secondFailed')}
    if not e: continue
    if all(p in e for p in PASSES):
        k = [e[p]['metrics']['outcomeK'] for p in PASSES]; n = e['p1']['metrics']['n']
        mean = sum(k) / 2; lo, hi = wilson(mean, n)
        e['meanOfPasses'] = {'outcome': f"{mean:g}/{n}, {100*mean/n:.1f}% (CI {100*lo:.1f}-{100*hi:.1f})", 'outcomeMean': mean,
                             'momentRecall': f"{sum(e[p]['metrics']['momentK'] for p in PASSES)/2:g}/{e['p1']['metrics']['momentN']}",
                             'commitments': f"{sum(e[p]['metrics']['commitmentK'] for p in PASSES)/2:g}/{e['p1']['metrics']['commitmentN']}",
                             'allMoments': f"{sum(e[p]['metrics']['allMomentsK'] for p in PASSES)/2:g}/{n}",
                             'r3outcomeMean': sum(e[p]['r3metrics']['outcomeK'] for p in PASSES) / 2,
                             'note': 'the CI is Wilson at the mean count over n (the two passes are not independent samples)'}
        e['passToPass'] = disagree(items4[(m, 'p1')], items4[(m, 'p2')])
    an['test'][m] = e

for a, b in [('gpt-4.1-mini', 'gpt-4.1'), ('gpt-4.1-mini', 'tiered'), ('tiered', 'gpt-4.1')]:
    for p in PASSES:
        if (a, p) in items4 and (b, p) in items4:
            A, B = items4[(a, p)], items4[(b, p)]
            an['test'][f'{a}_vs_{b}_{p}'] = {'outcome': mcnemar(ok(A), ok(B)), 'allMoments': mcnemar(allm(A), allm(B)), 'commitments': mcnemar(comm(A), comm(B))}

# 3-minute call cost. (a) ANALYSIS-COST.md's token model, as round 3 used it: mini Rs 0.073, gpt-4.1 Rs 0.38, tiered
# 0.073 + e x 0.38 with e = escalated / model-analysed calls. (b) [inference] the same model re-based on this round's
# measured prompt: input = (bench input per call - 100 bench transcript tokens) + 700 transcript tokens; output = bench
# output per call.
RATE = {'gpt-4.1-mini': (41.8, 167.2), 'gpt-4.1': (190, 760)}
def c3(model, inp, outp): return (inp * RATE[model][0] + outp * RATE[model][1]) / 1e6
cost3 = {}
tok = {}
for m in ('gpt-4.1-mini', 'gpt-4.1'):
    if all((m, p) in items4 for p in PASSES):
        ins = [an['test'][m][p]['tokens']['r4']['inPerCall'] for p in PASSES]; outs = [an['test'][m][p]['tokens']['r4']['outPerCall'] for p in PASSES]
        tok[m] = (sum(ins) / 2, sum(outs) / 2)
if 'gpt-4.1-mini' in tok and 'gpt-4.1' in tok:
    mini3b = c3('gpt-4.1-mini', tok['gpt-4.1-mini'][0] - 100 + 700, tok['gpt-4.1-mini'][1])
    g3b = c3('gpt-4.1', tok['gpt-4.1'][0] - 100 + 700, tok['gpt-4.1'][1])
    cost3 = {'model_a_ANALYSIS-COST.md': {'gpt-4.1-mini': 0.073, 'gpt-4.1': 0.38},
             'model_b_rebased': {'gpt-4.1-mini': round(mini3b, 4), 'gpt-4.1': round(g3b, 4), 'tokensPerCall_meanOfPasses': tok}}
    if all(('tiered', p) in items4 for p in PASSES):
        es = [an['test']['tiered'][p]['escalation']['escalated'] / an['test']['tiered'][p]['escalation']['analysed'] for p in PASSES]
        cost3['tiered'] = {'e': [round(x, 4) for x in es],
                           'a': [round(0.073 + x * 0.38, 4) for x in es], 'a_mean': round(0.073 + sum(es) / 2 * 0.38, 4),
                           'b': [round(mini3b + x * g3b, 4) for x in es], 'b_mean': round(mini3b + sum(es) / 2 * g3b, 4)}
    an['cost3min'] = cost3

# reverse_if of decision.2026-10-23.analysis-default-mini-single
rev = {}
if all(('gpt-4.1-mini', p) in items4 for p in PASSES):
    mk = lambda m, key: [an['test'][m][p]['metrics'][key] for p in PASSES]
    for other in ('gpt-4.1', 'tiered'):
        if not all((other, p) in items4 for p in PASSES): continue
        r = {}
        for key in ('outcomeK', 'momentK', 'commitmentK', 'allMomentsK'):
            mi, ot = mk('gpt-4.1-mini', key), mk(other, key)
            r[key] = {'mini': mi, other: ot, 'aheadByPerPass': [o - x for o, x in zip(ot, mi)], 'aheadByMean': (sum(ot) - sum(mi)) / 2}
        r['aheadByMoreThan4_onMeanOutcome'] = r['outcomeK']['aheadByMean'] > 4
        r['aheadByMoreThan4_onMeanMomentsOrCommitments'] = r['momentK']['aheadByMean'] > 4 or r['commitmentK']['aheadByMean'] > 4
        if cost3:
            c = cost3['tiered']['a_mean'] if other == 'tiered' else 0.38
            cb = cost3['tiered']['b_mean'] if other == 'tiered' else cost3['model_b_rebased']['gpt-4.1']
            r['cost3min'] = {'a': c, 'b': cb, 'insideBudget_a': c <= 0.17, 'insideBudget_b': cb <= 0.17}
            r['reverseMet'] = (r['aheadByMoreThan4_onMeanOutcome'] or r['aheadByMoreThan4_onMeanMomentsOrCommitments']) and c <= 0.17 and cb <= 0.17
        rev[other] = r
an['reverseIf'] = rev
out['analysis'] = an

# ---------------- Diagnostic re-runs (recorded tool arguments; not in any score)
diag = {}
for m in MODELS:
    d = load(f'{T}/bench-out-copy/operator-diag-{m}.json')
    if d: diag[m] = {t['id']: {'status': t['status'], 'why': t['why'][:200], 'benchRun': next((x['status'] for x in load(f'{R4}/operator-{m}.json')['tasks'] if x['id'] == t['id']), None)} for t in d['tasks']}
out['diagnostic'] = {'note': 'harness/diag.sh (run.sh operator branch with recorder.mjs preloaded), after the scored runs; not in any score', **diag}

# ---------------- Spend (harness ledger)
rows = [json.loads(l) for l in open(f'{T}/ledger.jsonl')]
sp = collections.OrderedDict()
for r in rows:
    b = sp.setdefault(r['run'], {'requests': 0, 'inr': 0.0, 'httpErrors': 0, 'retries429': 0, 'refusedByCap': 0})
    if r['event'] == 'ok': b['requests'] += 1; b['inr'] += r['inr']
    elif r['event'] == 'http_error': b['httpErrors'] += 1
    elif r['event'] == 'retry_429': b['retries429'] += 1
    elif r['event'].startswith('refused'): b['refusedByCap'] += 1
for b in sp.values(): b['inr'] = round(b['inr'], 2)
out['spend'] = {'byRun': sp, 'total': {'requests': sum(b['requests'] for b in sp.values()), 'inr': round(sum(r.get('inr', 0) for r in rows if r['event'] == 'ok'), 2),
                'httpErrors': sum(b['httpErrors'] for b in sp.values()), 'retries429': sum(b['retries429'] for b in sp.values()),
                'refusedByCap': sum(b['refusedByCap'] for b in sp.values())}, 'globalCap': 220,
                'prices': 'prices.ts list rates at Rs 95/$: gpt-4.1-mini Rs 41.8 in / 167.2 out per 1M tokens; gpt-4.1 Rs 190 / 760'}
json.dump(out, sys.stdout, indent=1, default=str)
