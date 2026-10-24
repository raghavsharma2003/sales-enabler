#!/usr/bin/env python3
# r7 comparison stats (r7 version of research/2026-10-24/benches-r6/harness/stats.py; r6's wilson, fmt, mcnemar, sign, amet,
# ok/allm/comm/objc, disagree, perCallTokens, pairs and runEntry are copied unchanged, and r6's 3-minute cost model is reused).
# Analysis only, TEST split, the shipped contract (prompt variant current = r6's r5-outcome-first, byte-identity gated):
# - gpt-4.1-mini single, two passes; tiered (mini first, gpt-4.1 at threshold 0.6), two passes; run interleaved.
# - Per run: every field; pass-to-pass disagreement within each arm; tiered escalations.
# - Exact two-sided McNemar, mini against tiered on the same 42 ids: same pass, crossed, pooled (exploratory).
# - Reproducibility against round 6 (same prompt bytes): r7 mini vs r6 mini (same pass), r7 tiered vs r6 tiered p1.
# - The rule of rule.txt (written before the first request), and the reverse_if of decision.2026-10-24.analysis-default-tiered.
# Wilson 95% CIs. Reads only the scrubbed bench JSONs in the worktree and the r7 ledger. Prints JSON to stdout.
import json, math, os, sys, collections
W = '/dev/shm/wt-bench7/research'
R5 = f'{W}/2026-10-24/benches-r5'
R6 = f'{W}/2026-10-24/benches-r6'
R7 = f'{W}/2026-10-24/benches-r7'
T = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r7'
PASSES = ('p1', 'p2')
GCAP = 40
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

crisisK = lambda items: sum(x['predicted']['crisis'] == x['key']['crisis'] for x in items)
crisisMiss = lambda items: [x['id'] for x in items if x['predicted']['crisis'] != x['key']['crisis']]

out = {'tree': '6d69a85febaf9f605ccf8178ab99ad245ec1b03f', 'contractCommit': '6245d4e', 'promptVariant': 'current',
       'contractGate': 'product/scripts/analysis-variant-probe.ts ok: shipped prompt byte-identical to product/scripts/analysis-bench/contracts/r6-outcome-first.bench.txt (sha256 ba7656b7...642fbb, 2817 chars)',
       'baseline': 'round 6, tree 839292d (research/2026-10-24/benches-r6), same prompt bytes; round 5, tree ab5dade (research/2026-10-24/benches-r5), the previous contract',
       'rule': 'harness/rule.txt', 'order': ['mini p1', 'tiered p1', 'mini p2', 'tiered p2']}
an = {}
mini = {p: load(f'{R7}/analysis-gpt-4.1-mini.current-{p}.json') for p in PASSES}
tier = {p: load(f'{R7}/analysis-tiered.current-{p}.json') for p in PASSES}
for p in PASSES:
    assert mini[p]['promptVariant'] == 'current' and mini[p]['split'] == 'test' and mini[p]['analysisSetting']['mode'] == 'single', p
    assert tier[p]['promptVariant'] == 'current' and tier[p]['split'] == 'test' and tier[p]['analysisSetting']['mode'] == 'tiered', p
    assert tier[p]['analysisSetting']['threshold'] == 0.6
    assert len(mini[p]['items']) == 42 and len(tier[p]['items']) == 42
r6m = {p: load(f'{R6}/analysis-gpt-4.1-mini.r5-outcome-first-{p}.json') for p in PASSES}
r6t = load(f'{R6}/analysis-tiered.r5-outcome-first-p1.json')
r5m = {p: load(f'{R5}/analysis-gpt-4.1-mini-{p}.json') for p in PASSES}
r5t = {p: load(f'{R5}/analysis-tiered-{p}.json') for p in PASSES}

def entry(j):
    e = runEntry(j)
    e['metrics']['crisisK'] = crisisK(j['items']); e['metrics']['crisisMissIds'] = crisisMiss(j['items'])
    e['metrics']['groundedK'] = sum(x['quotesProposed'] - x['quotesDropped'] for x in j['items'])
    e['metrics']['groundedN'] = sum(x['quotesProposed'] for x in j['items'])
    return e

def escalation(j):
    it = j['items']
    esc = [x for x in it if x.get('tier') and x['tier']['escalated']]
    why = collections.Counter(x['tier']['why'] if x.get('tier') else 'not analysed by the model' for x in it)
    return {'rate': fmt(len(esc), j['tier']['calls']), 'escalated': len(esc), 'analysed': j['tier']['calls'],
            'whyAll42': dict(why), 'byModel': j['tier']['byModel'], 'secondFailed': j['tier'].get('secondFailed'),
            'each': [(x['id'], x['template'], x['tier']['why'], 'key ' + str(x['key']['outcome']), 'final ' + str(x['predicted']['outcome'])) for x in esc]}

an['gpt-4.1-mini'] = {p: entry(mini[p]) for p in PASSES}
an['tiered'] = {p: entry(tier[p]) for p in PASSES}
for p in PASSES:
    an['tiered'][p]['escalation'] = escalation(tier[p])
for arm, R in (('gpt-4.1-mini', mini), ('tiered', tier)):
    M = {p: an[arm][p]['metrics'] for p in PASSES}; n = M['p1']['n']
    mean = sum(M[p]['outcomeK'] for p in PASSES) / 2; lo, hi = wilson(mean, n)
    an[arm]['meanOfPasses'] = {'outcome': f"{mean:g}/{n}, {100*mean/n:.1f}% (CI {100*lo:.1f}-{100*hi:.1f})", 'outcomeMean': mean,
                               'note': 'the CI is Wilson at the mean count over n (the two passes are not independent samples)'}
    an[arm]['passToPass'] = disagree(R['p1']['items'], R['p2']['items'])
    an[arm]['templatesPooled'] = {t: f"{sum(M[p]['templates'][t]['k'] for p in PASSES)}/{sum(M[p]['templates'][t]['n'] for p in PASSES)}" for t in TEMPLATES}

# ---------------- mini against tiered, same ids
cmpmt = {}
for p in PASSES:
    cmpmt[f'samePass_{p}'] = pairs(tier[p]['items'], mini[p]['items'])          # a = tiered, b = mini
    o = 'p2' if p == 'p1' else 'p1'
    cmpmt[f'crossed_tiered{o}_mini{p}'] = pairs(tier[o]['items'], mini[p]['items'])
    cmpmt[f'anyField_samePass_{p}'] = disagree(tier[p]['items'], mini[p]['items'])
pa = {f'{p}:{k}': v for p in PASSES for k, v in ok(tier[p]['items']).items()}
pb = {f'{p}:{k}': v for p in PASSES for k, v in ok(mini[p]['items']).items()}
cmpmt['pooled_exploratory'] = mcnemar(pa, pb)
cmpmt['note'] = 'aOnly = right under tiered only, bOnly = right under mini only; exact two-sided McNemar'
an['miniVsTiered'] = cmpmt

# ---------------- reproducibility against round 6 (same prompt bytes) and round 5 (previous contract)
rep = {}
for p in PASSES:
    rep[f'mini_{p}_vs_r6mini_{p}'] = pairs(r6m[p]['items'], mini[p]['items'])
    rep[f'mini_{p}_anyField_vs_r6mini_{p}'] = disagree(r6m[p]['items'], mini[p]['items'])
    rep[f'tiered_{p}_vs_r6tiered_p1'] = pairs(r6t['items'], tier[p]['items'])
    rep[f'tiered_{p}_anyField_vs_r6tiered_p1'] = disagree(r6t['items'], tier[p]['items'])
    rep[f'mini_{p}_vs_r5mini_{p}_previousContract'] = pairs(r5m[p]['items'], mini[p]['items'])
    rep[f'tiered_{p}_vs_r5tiered_{p}_previousContract'] = pairs(r5t[p]['items'], tier[p]['items'])
an['vsEarlierRounds'] = rep
an['earlier'] = {'r6_mini': [amet(r6m[p]['items'])['outcomeK'] for p in PASSES], 'r6_tiered': [amet(r6t['items'])['outcomeK']],
                 'r5_mini': [amet(r5m[p]['items'])['outcomeK'] for p in PASSES], 'r5_tiered': [amet(r5t[p]['items'])['outcomeK'] for p in PASSES]}

# ---------------- objection recall over this round's runs (all four are mini-first)
runs = [(f'mini-{p}', mini[p]['items']) for p in PASSES] + [(f'tiered-{p}', tier[p]['items']) for p in PASSES]
pool = {f'{r}:{c}': v for r, its in runs for c, v in objc(its).items()}
escd = {f'tiered-{p}:' + x['id'] for p in PASSES for x in tier[p]['items'] if x.get('tier') and x['tier']['escalated']}
own = {k: v for k, v in pool.items() if k not in escd}
an['miniFirstObjections'] = {'runs': [r for r, _ in runs], 'k': sum(pool.values()), 'n': len(pool), 'text': f"{sum(pool.values())}/{len(pool)}",
                             'misses': sorted(k for k, v in pool.items() if not v), 'miniRecordsOnly': f"{sum(own.values())}/{len(own)}",
                             'r6': '52/52 (DEV winner p1/p2, TEST mini p1/p2, tiered p1)'}

# ---------------- the rule (rule.txt)
MM = {p: an['gpt-4.1-mini'][p]['metrics'] for p in PASSES}; TM = {p: an['tiered'][p]['metrics'] for p in PASSES}
clauses = {
    '1_outcome_bothPasses_mini_ge_tiered_minus1': {p: {'mini': MM[p]['outcomeK'], 'tiered': TM[p]['outcomeK'], 'ok': MM[p]['outcomeK'] >= TM[p]['outcomeK'] - 1} for p in PASSES},
    '2_objections_bothPasses_mini_ge_tiered': {p: {'mini': MM[p]['objectionK'], 'tiered': TM[p]['objectionK'], 'ok': MM[p]['objectionK'] >= TM[p]['objectionK']} for p in PASSES},
    '2_moments_bothPasses_mini_ge_tiered': {p: {'mini': MM[p]['momentK'], 'tiered': TM[p]['momentK'], 'ok': MM[p]['momentK'] >= TM[p]['momentK']} for p in PASSES},
    '2_commitments_bothPasses_mini_ge_tiered': {p: {'mini': MM[p]['commitmentK'], 'tiered': TM[p]['commitmentK'], 'ok': MM[p]['commitmentK'] >= TM[p]['commitmentK']} for p in PASSES},
    '3_crisis_zeroErrors_bothMiniPasses': {p: {'mini': MM[p]['crisisK'], 'n': MM[p]['n'], 'ok': MM[p]['crisisK'] == MM[p]['n']} for p in PASSES},
}
met = {k: all(v[p]['ok'] for p in PASSES) for k, v in clauses.items()}
an['rule'] = {'file': 'harness/rule.txt', 'clauses': clauses, 'clauseMet': met, 'matches': all(met.values()),
              'verdict': 'MATCHES: recommend gpt-4.1-mini single as the default, tiered selectable' if all(met.values()) else 'DOES NOT MATCH: tiered stays the default',
              'failedClauses': [k for k, v in met.items() if not v]}

# ---------------- 3-minute cost (r6's model) and the decision's reverse_if
RATE = {'gpt-4.1-mini': (41.8, 167.2), 'gpt-4.1': (190, 760)}
def c3(model, inp, outp): return (inp * RATE[model][0] + outp * RATE[model][1]) / 1e6
ins = [an['gpt-4.1-mini'][p]['tokens']['inPerCall'] for p in PASSES]; outs = [an['gpt-4.1-mini'][p]['tokens']['outPerCall'] for p in PASSES]
tokm = (sum(ins) / 2, sum(outs) / 2)
mini3b = c3('gpt-4.1-mini', tokm[0] - 100 + 700, tokm[1])
G41OUT = json.load(open(f'{R5}/comparison.json'))['analysis']['cost3min']['model_b_rebased']['tokensPerCall_meanOfPasses']['gpt-4.1'][1]
g3b = c3('gpt-4.1', tokm[0] - 100 + 700, G41OUT)
e_ = sum(an['tiered'][p]['escalation']['escalated'] for p in PASSES) / sum(an['tiered'][p]['escalation']['analysed'] for p in PASSES)
an['cost3min'] = {'model_a_ANALYSIS-COST.md': {'gpt-4.1-mini': 0.073, 'gpt-4.1': 0.38},
                  'model_b_rebased': {'gpt-4.1-mini': round(mini3b, 4), 'gpt-4.1': round(g3b, 4), 'miniTokensPerCall_meanOfPasses': tokm,
                                      'gpt-4.1_tokens_source': f"this round's mini input per call; round 5's gpt-4.1 output per call ({G41OUT}, mean of its two TEST passes)"},
                  'tiered': {'e_pooledTwoPasses': round(e_, 4), 'a': round(0.073 + e_ * 0.38, 4), 'b': round(mini3b + e_ * g3b, 4)}}
mmean, tmean = an['gpt-4.1-mini']['meanOfPasses']['outcomeMean'], an['tiered']['meanOfPasses']['outcomeMean']
noLoss = all(MM[p]['momentK'] >= TM[p]['momentK'] and MM[p]['objectionK'] >= TM[p]['objectionK'] for p in PASSES)
rev = {'reverse_if': 'tiered measured cost > Rs 0.17 per 3-minute call, or a mini-single contract matches tiered on outcome (within 1/42 on the mean of two TEST passes) in two consecutive rounds with no moment or objection loss',
       'thisRound': {'miniMean': mmean, 'tieredMean': tmean, 'withinOne': tmean - mmean <= 1, 'noMomentOrObjectionLoss': noLoss},
       'previousRound_r6': {'miniMean': 42.0, 'tiered': 42, 'matched': True, 'note': 'r6 ran one tiered pass (42/42); open.2026-10-24.analysis-outcome-first-second-round records r6 as the first matching round'}}
rev['matchesThisRound'] = rev['thisRound']['withinOne'] and noLoss
rev['twoConsecutiveRounds'] = rev['matchesThisRound'] and rev['previousRound_r6']['matched']
rev['costOver017'] = {'a': an['cost3min']['tiered']['a'] > 0.17, 'b': an['cost3min']['tiered']['b'] > 0.17}
rev['met'] = rev['twoConsecutiveRounds'] or rev['costOver017']['a'] or rev['costOver017']['b']
rev['agreesWithRule'] = rev['twoConsecutiveRounds'] == an['rule']['matches']
an['reverseIf_analysis-default-tiered'] = rev

# ---------------- cost per model-analysed call, per run
cpc = {f'mini-{p}': mini[p]['cost']['inrPerCall'] for p in PASSES}
for p in PASSES: cpc[f'tiered-{p}'] = tier[p]['costTiered']['inr'] / tier[p]['tier']['calls']
an['costPerModelAnalysedCall'] = {k: round(v, 4) for k, v in cpc.items()}
out['analysis'] = an

# ---------------- Spend (harness ledger)
rows = [json.loads(l) for l in open(f'{T}/ledger.jsonl')]
sp = collections.OrderedDict()
for r in rows:
    b = sp.setdefault(r['run'], {'requests': 0, 'inr': 0.0, 'byModel': {}, 'httpErrors': 0, 'retries429': 0, 'refusedByCap': 0, 'networkErrors': 0})
    if r['event'] == 'ok':
        b['requests'] += 1; b['inr'] += r['inr']; m = r.get('model') or r['deployment']; b['byModel'][m] = b['byModel'].get(m, 0) + 1
    elif r['event'] == 'http_error': b['httpErrors'] += 1
    elif r['event'] == 'retry_429': b['retries429'] += 1
    elif r['event'] == 'network_error': b['networkErrors'] += 1
    elif r['event'].startswith('refused'): b['refusedByCap'] += 1
for b in sp.values(): b['inr'] = round(b['inr'], 2)
ts = sorted(r['ts'] for r in rows)
gaps = [(a, b) for a, b in zip(ts, ts[1:])]
out['spend'] = {'byRun': sp, 'total': {'requests': sum(b['requests'] for b in sp.values()), 'inr': round(sum(r.get('inr', 0) for r in rows if r['event'] == 'ok'), 2),
                'httpErrors': sum(b['httpErrors'] for b in sp.values()), 'retries429': sum(b['retries429'] for b in sp.values()),
                'networkErrors': sum(b['networkErrors'] for b in sp.values()), 'refusedByCap': sum(b['refusedByCap'] for b in sp.values())},
                'firstRequest': ts[0] if ts else None, 'lastRequest': ts[-1] if ts else None, 'globalCap': GCAP,
                'prices': 'prices.ts list rates at Rs 95/$: gpt-4.1-mini Rs 41.8 in / 167.2 out per 1M tokens; gpt-4.1 Rs 190 / 760',
                'note': 'ledger rows are written on response; request starts are paced by the guard at >= 1.5 s'}
json.dump(out, sys.stdout, indent=1, default=str)
