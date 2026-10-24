#!/usr/bin/env python3
# r6 comparison stats (r6 version of research/2026-10-24/benches-r5/harness/stats.py; the same wilson, fmt, mcnemar, amet,
# disagree, perCallTokens, pairs and 3-minute cost model). Analysis only.
# - DEV: 95339a6's arms (current, r5-short-objection, r5-outcome-first, r5-moment-not-outcome), two passes each, gpt-4.1-mini
#   single. Per arm and pass: outcome, objections, moments, commitments, the complaint and wrong_person templates; pass-to-pass
#   disagreement; exact McNemar against current (same pass) and against round 5's DEV runs; the selection rule of
#   dev-select-rule.txt (floors on both passes, highest mean outcome, ties to the arm closest to current).
# - TEST: the DEV winner, gpt-4.1-mini single, two passes; tiered once with the winner's prompt. Each mini pass against round 5
#   and round 4 mini single (same pass number and crossed), tiered against rounds 5 and 4; objection recall over this round's
#   mini-first runs; the replace criteria; the reverse_if of decision.2026-10-24.analysis-default-tiered.
# Wilson 95% CIs; exact two-sided McNemar on paired items over the same ids. Reads only the scrubbed bench JSONs in the
# worktree and the r6 ledger. Prints JSON to stdout.
import json, math, os, sys, collections
W = '/dev/shm/wt-bench6/research'
R4 = f'{W}/2026-10-24/benches-r4'
R5 = f'{W}/2026-10-24/benches-r5'
R6 = f'{W}/2026-10-24/benches-r6'
T = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r6'
PASSES = ('p1', 'p2')
ARMS = ('current', 'r5-short-objection', 'r5-outcome-first', 'r5-moment-not-outcome')
TIE_ORDER = ('current', 'r5-moment-not-outcome', 'r5-short-objection', 'r5-outcome-first')   # variant-probe line diff 0 < 1 < 4 < 18
GCAP = 60
TEMPLATES = ('complaint', 'wrong_person')

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

def sign(better, worse):
    nn = better + worse; kk = min(better, worse)
    return round(1.0 if nn == 0 else min(1.0, 2 * sum(math.comb(nn, i) for i in range(kk + 1)) / 2 ** nn), 4)

def load(p):
    return json.load(open(p)) if os.path.exists(p) else None

def amet(items):
    it = items
    reasonOk = lambda x: x['predicted']['reasonCode'] in [x['key']['reasonCode']] + (x['key'].get('reasonAlt') or [])
    need = [(x, m['kind']) for x in it for m in x['key']['moments']]
    com = [(x, k) for x, k in need if k == 'commitment']
    obj = [(x, k) for x, k in need if k == 'objection']
    sameSet = lambda a, b: len(a) == len(b) and all(i in b for i in a)
    extra = collections.Counter(k for x in it for k in x['predicted']['moments'] if k not in [m['kind'] for m in x['key']['moments']])
    tm = {t: [x for x in it if x['template'] == t] for t in TEMPLATES}
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
        'crisis': fmt(sum(x['predicted']['crisis'] == x['key']['crisis'] for x in it), len(it)),
        'grounding': fmt(sum(x['quotesProposed'] - x['quotesDropped'] for x in it), sum(x['quotesProposed'] for x in it)),
        'extraMomentKinds': dict(extra), 'extraMoments': sum(extra.values()),
        'templates': {t: {'k': sum(x['predicted']['outcome'] == x['key']['outcome'] for x in v), 'n': len(v),
                          'each': [(x['id'], 'key ' + str(x['key']['outcome']), 'got ' + str(x['predicted']['outcome']), x['predicted']['reasonCode'],
                                    'objection' in x['predicted']['moments']) for x in v]} for t, v in tm.items()},
        'falseNulls': [x['id'] for x in it if x['predicted']['outcome'] is None and x['key']['outcome'] is not None],
        'outcomeMisses': dict(collections.Counter(f"{x['template']}: {x['key']['outcome']}->{x['predicted']['outcome']}" for x in it if x['predicted']['outcome'] != x['key']['outcome'])),
        'outcomeMissIds': [x['id'] for x in it if x['predicted']['outcome'] != x['key']['outcome']],
        'reasonMisses': [(x['id'], x['key']['reasonCode'], x['predicted']['reasonCode']) for x in it if not reasonOk(x)],
        'momentMisses': [(x['id'], [m['kind'] for m in x['key']['moments'] if m['kind'] not in x['predicted']['moments']]) for x in it
                         if any(m['kind'] not in x['predicted']['moments'] for m in x['key']['moments'])],
        'objectionMissIds': [x['id'] for x in it if any(m['kind'] == 'objection' for m in x['key']['moments']) and 'objection' not in x['predicted']['moments']],
        'complaintReasonCodes': dict(collections.Counter(x['predicted']['reasonCode'] for x in it if x['template'] == 'complaint')),
        'status': dict(collections.Counter(x['analysisStatus'] for x in it)),
    }

ok = lambda items: {x['id']: x['predicted']['outcome'] == x['key']['outcome'] for x in items}
allm = lambda items: {x['id']: all(m['kind'] in x['predicted']['moments'] for m in x['key']['moments']) for x in items}
comm = lambda items: {x['id']: all(m['kind'] in x['predicted']['moments'] for m in x['key']['moments'] if m['kind'] == 'commitment')
                      for x in items if any(m['kind'] == 'commitment' for m in x['key']['moments'])}
objc = lambda items: {x['id']: 'objection' in x['predicted']['moments'] for x in items if any(m['kind'] == 'objection' for m in x['key']['moments'])}

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

def pairs(a, b):
    return {'outcome': mcnemar(ok(a), ok(b)), 'allMoments': mcnemar(allm(a), allm(b)), 'objectionPerCall': mcnemar(objc(a), objc(b)),
            'commitments': mcnemar(comm(a), comm(b))}

def runEntry(j):
    return {'metrics': amet(j['items']), 'promptVariant': j.get('promptVariant'), 'analysisSetting': j.get('analysisSetting'),
            'cost': j.get('cost'), 'costTiered': j.get('costTiered'), 'tier': j.get('tier'), 'tokens': perCallTokens(j), 'cross': j.get('cross'),
            'truncated': j.get('truncated'), 'ledger': {k: v for k, v in j['harness'].items() if k != 'httpErrorDetails'},
            'httpErrorDetails': j['harness'].get('httpErrorDetails')}

out = {'tree': '839292db0bff5e5669beab2f5307e9ac9b213eeb', 'armsFrom': '95339a6',
       'baseline': 'round 5, tree ab5dade (research/2026-10-24/benches-r5); round 4, tree 8e3440a (research/2026-10-24/benches-r4)',
       'selectionRule': 'harness/dev-select-rule.txt'}
an = {'dev': {}, 'test': {}}

# ---------------- DEV: four arms x two passes
dev = {(a, p): load(f'{R6}/analysis-dev-gpt-4.1-mini.{a}-{p}.json') for a in ARMS for p in PASSES}
r5dev = {a: load(f'{R5}/analysis-dev-gpt-4.1-mini.json' if a == 'current' else f'{R5}/analysis-dev-gpt-4.1-mini.{a}.json')
         for a in ('current', 'r4-table', 'r3-stance', 'no-outcome-rules')}
r4dev = load(f'{R4}/analysis-dev-gpt-4.1-mini.json')
an['dev']['r5'] = {a: {k: amet(j['items'])[k] for k in ('outcomeK', 'objectionK', 'momentK', 'commitmentK', 'templates', 'falseNulls')} for a, j in r5dev.items()}
for a in ARMS:
    e = {}
    for p in PASSES:
        j = dev[(a, p)]
        if not j: continue
        assert j.get('promptVariant') == a, f'{a} {p}: report says contract {j.get("promptVariant")}'
        assert (j.get('analysisSetting') or {}).get('mode') == 'single', f'{a} {p}: not mini single'
        e[p] = runEntry(j)
        if a != 'current' and dev[('current', p)]: e[p]['vs_current_samePass'] = pairs(dev[('current', p)]['items'], j['items'])
        e[p]['vs_r5dev_current'] = pairs(r5dev['current']['items'], j['items'])
        e[p]['vs_r5dev_r4table'] = pairs(r5dev['r4-table']['items'], j['items'])
        e[p]['vs_r4dev'] = pairs(r4dev['items'], j['items'])
    if all(p in e for p in PASSES):
        M = {p: e[p]['metrics'] for p in PASSES}
        e['meanOutcome'] = sum(M[p]['outcomeK'] for p in PASSES) / 2
        e['floors'] = {'objections11_both': all(M[p]['objectionK'] == 11 for p in PASSES),
                       'moments35_both': all(M[p]['momentK'] >= 35 for p in PASSES),
                       'commitments11_both': all(M[p]['commitmentK'] == 11 for p in PASSES)}
        e['eligible'] = all(e['floors'].values())
        e['passToPass'] = disagree(dev[(a, 'p1')]['items'], dev[(a, 'p2')]['items'])
        e['templatesPooled'] = {t: f"{sum(M[p]['templates'][t]['k'] for p in PASSES)}/{sum(M[p]['templates'][t]['n'] for p in PASSES)}" for t in TEMPLATES}
        if a != 'current' and all(dev[('current', p)] for p in PASSES):
            # (pass, call) pairs pooled over both passes, against current's same pass [pairs share call ids: exploratory]
            pa = {f'{p}:{k}': v for p in PASSES for k, v in ok(dev[('current', p)]['items']).items()}
            pb = {f'{p}:{k}': v for p in PASSES for k, v in ok(dev[(a, p)]['items']).items()}
            e['vs_current_pooledPasses_exploratory'] = mcnemar(pa, pb)
    an['dev'][a] = e

# selection rule
if all(dev.values()):
    elig = [a for a in ARMS if an['dev'][a]['eligible']]
    best = max((an['dev'][a]['meanOutcome'] for a in elig), default=None)
    tied = [a for a in TIE_ORDER if a in elig and an['dev'][a]['meanOutcome'] == best]
    an['dev']['selection'] = {'rule': 'eligible = objections 11/11, moments >= 35/36, commitments 11/11 on both DEV passes; winner = highest mean outcome; ties to the arm closest to current (current < r5-moment-not-outcome < r5-short-objection < r5-outcome-first)',
                              'perArm': {a: {'meanOutcome': an['dev'][a]['meanOutcome'], 'outcome': [an['dev'][a][p]['metrics']['outcomeK'] for p in PASSES],
                                             'objections': [an['dev'][a][p]['metrics']['objectionK'] for p in PASSES], 'moments': [an['dev'][a][p]['metrics']['momentK'] for p in PASSES],
                                             'commitments': [an['dev'][a][p]['metrics']['commitmentK'] for p in PASSES], 'eligible': an['dev'][a]['eligible'], 'floors': an['dev'][a]['floors']} for a in ARMS},
                              'eligible': elig, 'bestMean': best, 'tiedAtBest': tied, 'winner': tied[0] if tied else None,
                              'stopBeforeTest': not elig}
WIN = (an['dev'].get('selection') or {}).get('winner')

# ---------------- TEST: the winner, mini single x2, tiered x1
r5m = {p: load(f'{R5}/analysis-gpt-4.1-mini-{p}.json') for p in PASSES}
r4m = {p: load(f'{R4}/analysis-gpt-4.1-mini-{p}.json') for p in PASSES}
r5t = {p: load(f'{R5}/analysis-tiered-{p}.json') for p in PASSES}
r4t = {p: load(f'{R4}/analysis-tiered-{p}.json') for p in PASSES}
an['test']['r5_gpt-4.1-mini'] = {p: {k: amet(r5m[p]['items'])[k] for k in ('outcomeK', 'objectionK', 'momentK', 'commitmentK', 'allMomentsK', 'templates', 'falseNulls')} for p in PASSES}
an['test']['r4_gpt-4.1-mini'] = {p: {k: amet(r4m[p]['items'])[k] for k in ('outcomeK', 'objectionK', 'momentK', 'commitmentK', 'allMomentsK', 'templates', 'falseNulls')} for p in PASSES}
an['test']['r5_tiered'] = {p: {k: amet(r5t[p]['items'])[k] for k in ('outcomeK', 'objectionK', 'momentK', 'commitmentK', 'allMomentsK')} for p in PASSES}
mini, tier1 = {}, None
if WIN:
    mini = {p: load(f'{R6}/analysis-gpt-4.1-mini.{WIN}-{p}.json') for p in PASSES}
    mini = {p: j for p, j in mini.items() if j}
    tier1 = load(f'{R6}/analysis-tiered.{WIN}-p1.json')
    e = {'arm': WIN}
    for p, j in mini.items():
        assert j.get('promptVariant') == WIN and j['split'] == 'test' and (j.get('analysisSetting') or {}).get('mode') == 'single'
        e[p] = runEntry(j)
        o = 'p2' if p == 'p1' else 'p1'
        e[p]['vs_r5mini_samePass'] = pairs(r5m[p]['items'], j['items'])
        e[p][f'vs_r5mini_{o}_crossed'] = pairs(r5m[o]['items'], j['items'])
        e[p]['vs_r4mini_samePass'] = pairs(r4m[p]['items'], j['items'])
        e[p][f'vs_r4mini_{o}_crossed'] = pairs(r4m[o]['items'], j['items'])
    if all(p in mini for p in PASSES):
        M = {p: e[p]['metrics'] for p in PASSES}; n = M['p1']['n']
        mean = sum(M[p]['outcomeK'] for p in PASSES) / 2; lo, hi = wilson(mean, n)
        e['meanOfPasses'] = {'outcome': f"{mean:g}/{n}, {100*mean/n:.1f}% (CI {100*lo:.1f}-{100*hi:.1f})", 'outcomeMean': mean,
                             'r5outcomeMean': sum(an['test']['r5_gpt-4.1-mini'][p]['outcomeK'] for p in PASSES) / 2,
                             'r4outcomeMean': sum(an['test']['r4_gpt-4.1-mini'][p]['outcomeK'] for p in PASSES) / 2,
                             'note': 'the CI is Wilson at the mean count over n (the two passes are not independent samples)'}
        e['passToPass'] = disagree(mini['p1']['items'], mini['p2']['items'])
        # pooled (pass, call) pairs against round 5 and round 4 mini single [exploratory: pairs share call ids]
        for rnd, ref in (('r5', r5m), ('r4', r4m)):
            pa = {f'{p}:{k}': v for p in PASSES for k, v in ok(ref[p]['items']).items()}
            pb = {f'{p}:{k}': v for p in PASSES for k, v in ok(mini[p]['items']).items()}
            m_ = mcnemar(pa, pb)
            calls = sorted({k.split(':', 1)[1] for k in pa})
            per = {c: (sum(pa[f'{p}:{c}'] for p in PASSES), sum(pb[f'{p}:{c}'] for p in PASSES)) for c in calls}
            better = [c for c in calls if per[c][1] > per[c][0]]; worse = [c for c in calls if per[c][1] < per[c][0]]
            e[f'vs_{rnd}mini_pooled_exploratory'] = {**m_, 'distinctCalls': {'better': better, 'worse': worse, 'signTestP': sign(len(better), len(worse))}}
        e['templatesPooled'] = {t: f"{sum(M[p]['templates'][t]['k'] for p in PASSES)}/{sum(M[p]['templates'][t]['n'] for p in PASSES)}" for t in TEMPLATES}
    an['test']['gpt-4.1-mini'] = e
    if tier1:
        assert tier1.get('promptVariant') == WIN and (tier1.get('analysisSetting') or {}).get('mode') == 'tiered'
        t = runEntry(tier1)
        it = tier1['items']
        esc = [x for x in it if x.get('tier') and x['tier']['escalated']]
        M1 = {x['id']: x for x in mini['p1']['items']} if 'p1' in mini else {}
        def did(x):
            right = x['predicted']['outcome'] == x['key']['outcome']
            if x['tier']['why'] == 'no outcome':
                if x['key']['outcome'] is None: return 'kept a right null' if right else 'broke a right null'
                return 'fixed a wrong null' if right else 'still wrong'
            return ('right' if right else 'wrong') + ' (first pass not stored; mini single p1: ' + str(M1.get(x['id'], {}).get('predicted', {}).get('outcome')) + ')'
        t['escalation'] = {'rate': fmt(len(esc), tier1['tier']['calls']), 'escalated': len(esc), 'analysed': tier1['tier']['calls'],
                           'why': dict(collections.Counter(x['tier']['why'] for x in it if x.get('tier'))),
                           'each': [(x['id'], x['template'], x['tier']['why'], 'key ' + str(x['key']['outcome']), 'final ' + str(x['predicted']['outcome']),
                                     'moments ' + ','.join(x['predicted']['moments']), did(x)) for x in esc],
                           'did': dict(collections.Counter(did(x).split(' (')[0] for x in esc)), 'secondFailed': tier1['tier'].get('secondFailed')}
        for p in PASSES:
            t[f'vs_r5tiered_{p}'] = pairs(r5t[p]['items'], it)
            t[f'vs_r4tiered_{p}'] = pairs(r4t[p]['items'], it)
            if p in mini: t[f'vs_r6mini_{p}'] = pairs(mini[p]['items'], it)
        an['test']['tiered'] = t

# ---------------- objection recall over this round's mini-first runs (DEV winner p1, p2; TEST mini p1, p2; tiered p1)
if WIN and all(p in mini for p in PASSES) and tier1:
    runs = [(f'dev-{p}', dev[(WIN, p)]['items']) for p in PASSES] + [(f'mini-{p}', mini[p]['items']) for p in PASSES] + [('tiered-p1', tier1['items'])]
    pool = {f'{r}:{c}': v for r, its in runs for c, v in objc(its).items()}
    escd = {'tiered-p1:' + x['id'] for x in tier1['items'] if x.get('tier') and x['tier']['escalated']}
    own = {k: v for k, v in pool.items() if k not in escd}
    an['miniFirstObjections'] = {'runs': [r for r, _ in runs], 'k': sum(pool.values()), 'n': len(pool), 'text': f"{sum(pool.values())}/{len(pool)}",
                                 'misses': sorted(k for k, v in pool.items() if not v), 'bar': '>= 51/52 (at most one miss)',
                                 'meetsBar': len(pool) - sum(pool.values()) <= 1,
                                 'miniRecordsOnly': {'excludedEscalated': sorted(k for k in escd if k in pool), 'text': f"{sum(own.values())}/{len(own)}"},
                                 'r5': '51/51 (DEV current, mini p1/p2, tiered p1/p2)'}

# ---------------- the replace criteria (dev-select-rule.txt) and the tiered decision's reverse_if
if WIN and all(p in mini for p in PASSES):
    M = {p: an['test']['gpt-4.1-mini'][p]['metrics'] for p in PASSES}
    tmplNulls = {p: [i for i in M[p]['falseNulls'] if i.split('.')[0] in TEMPLATES] for p in PASSES}
    lossP = {f'{p}:{k}': v['outcome']['p'] for p in PASSES for k, v in an['test']['gpt-4.1-mini'][p].items() if k.startswith('vs_r5mini') and len(v['outcome']['aOnly']) > len(v['outcome']['bOnly'])}
    crit = {'meanOutcome_ge_41': an['test']['gpt-4.1-mini']['meanOfPasses']['outcomeMean'] >= 41,
            'noTemplateFalseNull_bothPasses': all(not tmplNulls[p] for p in PASSES),
            'objections10_bothPasses': all(M[p]['objectionK'] == 10 for p in PASSES),
            'miniFirstObjections_ge_51of52': (an.get('miniFirstObjections') or {}).get('meetsBar'),
            'moments_ge_35_bothPasses': all(M[p]['momentK'] >= 35 for p in PASSES),
            'commitments10_bothPasses': all(M[p]['commitmentK'] == 10 for p in PASSES),
            'noLossVsR5_p_lt_0.05': all(v >= 0.05 for v in lossP.values())}
    an['replace'] = {'arm': WIN, 'criteria': crit, 'templateFalseNulls': tmplNulls, 'lossPvaluesVsR5': lossP,
                     'allMet': all(bool(v) for v in crit.values()), 'appliesOnlyIfWinnerIsNotCurrent': True}

RATE = {'gpt-4.1-mini': (41.8, 167.2), 'gpt-4.1': (190, 760)}
def c3(model, inp, outp): return (inp * RATE[model][0] + outp * RATE[model][1]) / 1e6
if WIN and all(p in mini for p in PASSES):
    ins = [an['test']['gpt-4.1-mini'][p]['tokens']['inPerCall'] for p in PASSES]; outs = [an['test']['gpt-4.1-mini'][p]['tokens']['outPerCall'] for p in PASSES]
    tokm = (sum(ins) / 2, sum(outs) / 2)
    mini3b = c3('gpt-4.1-mini', tokm[0] - 100 + 700, tokm[1])
    G41OUT = json.load(open(f'{R5}/comparison.json'))['analysis']['cost3min']['model_b_rebased']['tokensPerCall_meanOfPasses']['gpt-4.1'][1]
    g3b = c3('gpt-4.1', tokm[0] - 100 + 700, G41OUT)   # round 5's gpt-4.1 output per call, mean of its two TEST passes; gpt-4.1 single did not run in round 6
    cost3 = {'model_a_ANALYSIS-COST.md': {'gpt-4.1-mini': 0.073, 'gpt-4.1': 0.38},
             'model_b_rebased': {'gpt-4.1-mini': round(mini3b, 4), 'gpt-4.1': round(g3b, 4), 'miniTokensPerCall_meanOfPasses': tokm,
                                 'gpt-4.1_tokens_source': f"this round's mini input per call; round 5's gpt-4.1 output per call ({G41OUT}, mean of its two TEST passes)"}}
    if 'tiered' in an['test']:
        esc = an['test']['tiered']['escalation']; e_ = esc['escalated'] / esc['analysed']
        cost3['tiered'] = {'e': round(e_, 4), 'a': round(0.073 + e_ * 0.38, 4), 'b': round(mini3b + e_ * g3b, 4)}
    an['cost3min'] = cost3
    rev = {'reverse_if': 'tiered measured cost > Rs 0.17 per 3-minute call, or a mini-single contract matches tiered on outcome (within 1/42 on the mean of two TEST passes) in two consecutive rounds with no moment or objection loss'}
    mm = an['test']['gpt-4.1-mini']['meanOfPasses']['outcomeMean']
    if 'tiered' in an['test']:
        tk = an['test']['tiered']['metrics']
        rev['thisRound'] = {'miniMean': mm, 'tieredThisRound': tk['outcomeK'], 'tieredR5Mean': 42.0,
                            'withinOne_vsThisRoundTiered': tk['outcomeK'] - mm <= 1, 'withinOne_vsR5TieredMean': 42.0 - mm <= 1,
                            'noMomentOrObjectionLoss': all(M[p]['momentK'] >= tk['momentK'] and M[p]['objectionK'] >= tk['objectionK'] for p in PASSES)}
        rev['previousRound'] = {'r5MiniMean': 38.5, 'r5TieredMean': 42.0, 'withinOne': False}
        rev['matchesThisRound'] = rev['thisRound']['withinOne_vsThisRoundTiered'] and rev['thisRound']['withinOne_vsR5TieredMean'] and rev['thisRound']['noMomentOrObjectionLoss']
        rev['twoConsecutiveRounds'] = False   # round 5 did not match (38.5 vs 42.0)
        rev['costOver017'] = {'a': cost3['tiered']['a'] > 0.17, 'b': cost3['tiered']['b'] > 0.17}
        rev['reverses'] = rev['twoConsecutiveRounds'] or rev['costOver017']['a'] or rev['costOver017']['b']
    an['reverseIf_analysis-default-tiered'] = rev

# cost per model-analysed call, per run
cpc = {}
for (a, p), j in dev.items():
    if j: cpc[f'dev-{a}-{p}'] = j['cost']['inrPerCall']
for p, j in mini.items(): cpc[f'test-mini-{WIN}-{p}'] = j['cost']['inrPerCall']
if tier1: cpc[f'test-tiered-{WIN}-p1'] = tier1['costTiered']['inr'] / tier1['tier']['calls']
an['costPerCall'] = {k: round(v, 4) for k, v in cpc.items() if v is not None}
out['analysis'] = an

# ---------------- Spend (harness ledger)
rows = [json.loads(l) for l in open(f'{T}/ledger.jsonl')]
sp = collections.OrderedDict()
for r in rows:
    b = sp.setdefault(r['run'], {'requests': 0, 'inr': 0.0, 'httpErrors': 0, 'retries429': 0, 'refusedByCap': 0, 'networkErrors': 0})
    if r['event'] == 'ok': b['requests'] += 1; b['inr'] += r['inr']
    elif r['event'] == 'http_error': b['httpErrors'] += 1
    elif r['event'] == 'retry_429': b['retries429'] += 1
    elif r['event'] == 'network_error': b['networkErrors'] += 1
    elif r['event'].startswith('refused'): b['refusedByCap'] += 1
for b in sp.values(): b['inr'] = round(b['inr'], 2)
out['spend'] = {'byRun': sp, 'total': {'requests': sum(b['requests'] for b in sp.values()), 'inr': round(sum(r.get('inr', 0) for r in rows if r['event'] == 'ok'), 2),
                'httpErrors': sum(b['httpErrors'] for b in sp.values()), 'retries429': sum(b['retries429'] for b in sp.values()),
                'networkErrors': sum(b['networkErrors'] for b in sp.values()), 'refusedByCap': sum(b['refusedByCap'] for b in sp.values())},
                'firstRequest': rows[0]['ts'] if rows else None, 'lastRequest': rows[-1]['ts'] if rows else None, 'globalCap': GCAP,
                'prices': 'prices.ts list rates at Rs 95/$: gpt-4.1-mini Rs 41.8 in / 167.2 out per 1M tokens; gpt-4.1 Rs 190 / 760'}
json.dump(out, sys.stdout, indent=1, default=str)
