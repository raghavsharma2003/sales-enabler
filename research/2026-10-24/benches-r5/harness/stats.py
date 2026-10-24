#!/usr/bin/env python3
# r5 comparison stats (r5 version of research/2026-10-24/benches-r4/harness/stats.py; the same wilson, fmt, mcnemar,
# amet, disagree, perCallTokens and 3-minute cost model). Analysis only: no operator stage this round.
# Wilson 95% CIs; exact two-sided McNemar on paired items; round 4 -> round 5 on the same ids.
# - DEV: the four 2cdf64b contract arms (current, r4-table, r3-stance, no-outcome-rules), each against round 4's DEV
#   pass, against current and against r4-table, on outcome, every-moment and per-call objection recall.
# - TEST: two passes each of gpt-4.1-mini single and tiered (and gpt-4.1 single when it ran): each r5 pass against the
#   same-numbered r4 pass (and crossed), pass-to-pass disagreement, mean of the passes, design against design per pass,
#   tiered's escalations, the 3-minute cost, the reverse_if of decision.2026-10-23.analysis-default-mini-single.
# - The regression under test: objection recall over the mini-first runs (DEV current, mini p1/p2, tiered p1/p2),
#   round 3 / round 4 / round 5, exact McNemar on (run, call) pairs, a sign test on distinct calls, and the 5 calls that
#   lost an objection in round 4, run by run.
# Reads only the scrubbed bench JSONs in the worktree. Prints JSON to stdout.
import json, math, os, sys, collections
W = '/dev/shm/wt-bench5/research'
R3 = f'{W}/2026-10-23/benches-r3'
R4 = f'{W}/2026-10-24/benches-r4'
R5 = f'{W}/2026-10-24/benches-r5'
T = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r5'
SPLITS = json.load(open(f'{T}/splits.json'))
PASSES = ('p1', 'p2')
ARMS = ('current', 'r4-table', 'r3-stance', 'no-outcome-rules')
GCAP = 60
LOST_R4 = ['complaint.lending.hinglish', 'objection_resolved.telecom.hinglish', 'objection_resolved.realestate.hinglish',
           'objection_resolved.ecommerce.hinglish', 'complaint.realestate.hinglish']

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

out = {'tree': 'ab5dade4726174f32ce195959613bc7dfa11ab5c', 'fixUnderTest': '2cdf64b',
       'baseline': 'round 4, tree 8e3440a (research/2026-10-24/benches-r4); round 3, tree cd94b63 (research/2026-10-23/benches-r3)'}

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
        'objectionMissIds': [x['id'] for x in it if any(m['kind'] == 'objection' for m in x['key']['moments']) and 'objection' not in x['predicted']['moments']],
        'status': dict(collections.Counter(x['analysisStatus'] for x in it)),
    }

ok = lambda items: {x['id']: x['predicted']['outcome'] == x['key']['outcome'] for x in items}
allm = lambda items: {x['id']: all(m['kind'] in x['predicted']['moments'] for m in x['key']['moments']) for x in items}
comm = lambda items: {x['id']: all(m['kind'] in x['predicted']['moments'] for m in x['key']['moments'] if m['kind'] == 'commitment')
                      for x in items if any(m['kind'] == 'commitment' for m in x['key']['moments'])}
# per-call objection recall: calls whose key has an objection; True when the analysis listed an objection
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

an = {'dev': {}, 'test': {}}
# ---------------- DEV: four contract arms
dev4, dev3 = load(f'{R4}/analysis-dev-gpt-4.1-mini.json'), load(f'{R3}/analysis-dev-gpt-4.1-mini.json')
devArm = {a: load(f'{R5}/analysis-dev-gpt-4.1-mini.json' if a == 'current' else f'{R5}/analysis-dev-gpt-4.1-mini.{a}.json') for a in ARMS}
an['dev']['r4_gpt-4.1-mini'] = amet(dev4['items'])
an['dev']['r3_gpt-4.1-mini'] = {k: amet(dev3['items'])[k] for k in ('outcome', 'outcomeK', 'momentRecall', 'objectionRecall', 'objectionK', 'commitmentRecall', 'allMomentsFound')}
for a, j in devArm.items():
    if not j: continue
    assert j.get('promptVariant') == a, f'{a}: report says contract {j.get("promptVariant")}'
    e = {'metrics': amet(j['items']), 'promptVariant': j['promptVariant'], 'cost': j.get('cost'), 'tokens': perCallTokens(j),
         'ledger': {k: v for k, v in j['harness'].items() if k != 'httpErrorDetails'}, 'httpErrorDetails': j['harness'].get('httpErrorDetails'),
         'vs_r4dev': pairs(dev4['items'], j['items']), 'vs_r3dev': pairs(dev3['items'], j['items'])}
    if a != 'current' and devArm['current']: e['vs_current'] = pairs(devArm['current']['items'], j['items'])
    if a not in ('current', 'r4-table') and devArm['r4-table']: e['vs_r4table'] = pairs(devArm['r4-table']['items'], j['items'])
    an['dev'][a] = e
cur = devArm['current']
if cur:
    m = amet(cur['items'])
    an['dev']['stopRule'] = {'rule': 'stop if DEV outcome <= 38/42 or DEV objection recall < 9/11 (round 4); also moments < 32/36 or commitments < 7/11',
                             'outcomeK': m['outcomeK'], 'objectionK': m['objectionK'], 'objectionN': m['objectionN'], 'momentK': m['momentK'], 'commitmentK': m['commitmentK'],
                             'stop': m['outcomeK'] <= 38 or m['objectionK'] < 9 or m['momentK'] < 32 or m['commitmentK'] < 7}
if all(devArm.values()):
    miss = {a: set(amet(devArm[a]['items'])['objectionMissIds']) for a in ARMS}
    kept_by_both = sorted(miss['r4-table'] - miss['r3-stance'] - miss['no-outcome-rules'])
    an['dev']['ablationReading'] = {
        'objectionMisses': {a: sorted(v) for a, v in miss.items()},
        'r4tableMissesKeptByBothR3stanceAndNoOutcomeRules': kept_by_both,
        'tableCrowdsOutObjections_preRegistered': len(kept_by_both) >= 2,
        'r4table_vs_r3stance_objectionGap': len(miss['r4-table']) - len(miss['r3-stance']),
        'reverseIf_objection-always-a-moment': {'currentStillDrops': len(miss['current']) > 0,
                                                'lossIsNoiseAgainstR3stance': abs(len(miss['r4-table']) - len(miss['r3-stance'])) <= 1}}

# ---------------- TEST
items5, items4, items3 = {}, {}, {}
for m in ('gpt-4.1-mini', 'gpt-4.1', 'tiered'):
    e = {}
    for p in PASSES:
        r5, r4, r3 = load(f'{R5}/analysis-{m}-{p}.json'), load(f'{R4}/analysis-{m}-{p}.json'), load(f'{R3}/analysis-{m}-{p}.json')
        if not r5: continue
        assert r5.get('promptVariant', 'current') == 'current'
        items5[(m, p)], items4[(m, p)], items3[(m, p)] = r5['items'], r4['items'], r3['items']
        e[p] = {'metrics': amet(r5['items']), 'cost': r5.get('cost'), 'costTiered': r5.get('costTiered'), 'tier': r5.get('tier'),
                'tokens': {'r5': perCallTokens(r5), 'r4': perCallTokens(r4)},
                'cross': r5.get('cross'), 'ledger': {k: v for k, v in r5['harness'].items() if k != 'httpErrorDetails'},
                'httpErrorDetails': r5['harness'].get('httpErrorDetails'), 'truncated': r5.get('truncated'),
                'r4metrics': {k: amet(r4['items'])[k] for k in ('outcome', 'outcomeK', 'momentRecall', 'objectionRecall', 'objectionK', 'commitmentRecall', 'allMomentsFound', 'outcomeMisses', 'objectionMissIds')},
                'vs_r4_samePass': pairs(r4['items'], r5['items']),
                'vs_r3_samePass': pairs(r3['items'], r5['items'])}
        other = 'p2' if p == 'p1' else 'p1'
        r4o = load(f'{R4}/analysis-{m}-{other}.json')
        e[p][f'vs_r4{other}_crossed'] = pairs(r4o['items'], r5['items'])
        if m == 'tiered':
            it = r5['items']
            esc = [x for x in it if x.get('tier') and x['tier']['escalated']]
            mini = load(f'{R5}/analysis-gpt-4.1-mini-{p}.json')
            M = {x['id']: x for x in mini['items']} if mini else {}
            def did(x):
                right = x['predicted']['outcome'] == x['key']['outcome']
                if x['tier']['why'] == 'no outcome':   # the first pass recorded no outcome: exact
                    if x['key']['outcome'] is None: return 'kept a right null' if right else 'broke a right null'
                    return 'fixed a wrong null' if right else 'still wrong'
                return ('right' if right else 'wrong') + ' (first pass not stored; mini single same pass: ' + str(M.get(x['id'], {}).get('predicted', {}).get('outcome')) + ')'
            e[p]['escalation'] = {'rate': fmt(len(esc), r5['tier']['calls']), 'escalated': len(esc), 'analysed': r5['tier']['calls'],
                                  'why': dict(collections.Counter(x['tier']['why'] for x in it if x.get('tier'))),
                                  'each': [(x['id'], x['template'], x['tier']['why'], 'key ' + str(x['key']['outcome']), 'final ' + str(x['predicted']['outcome']),
                                            'moments ' + ','.join(x['predicted']['moments']), did(x)) for x in esc],
                                  'did': dict(collections.Counter(did(x).split(' (')[0] for x in esc)),
                                  'secondFailed': r5['tier'].get('secondFailed')}
    if not e: continue
    if all(p in e for p in PASSES):
        k = [e[p]['metrics']['outcomeK'] for p in PASSES]; n = e['p1']['metrics']['n']
        mean = sum(k) / 2; lo, hi = wilson(mean, n)
        e['meanOfPasses'] = {'outcome': f"{mean:g}/{n}, {100*mean/n:.1f}% (CI {100*lo:.1f}-{100*hi:.1f})", 'outcomeMean': mean,
                             'momentRecall': f"{sum(e[p]['metrics']['momentK'] for p in PASSES)/2:g}/{e['p1']['metrics']['momentN']}",
                             'objections': f"{sum(e[p]['metrics']['objectionK'] for p in PASSES)/2:g}/{e['p1']['metrics']['objectionN']}",
                             'commitments': f"{sum(e[p]['metrics']['commitmentK'] for p in PASSES)/2:g}/{e['p1']['metrics']['commitmentN']}",
                             'allMoments': f"{sum(e[p]['metrics']['allMomentsK'] for p in PASSES)/2:g}/{n}",
                             'r4outcomeMean': sum(e[p]['r4metrics']['outcomeK'] for p in PASSES) / 2,
                             'note': 'the CI is Wilson at the mean count over n (the two passes are not independent samples)'}
        e['passToPass'] = disagree(items5[(m, 'p1')], items5[(m, 'p2')])
    an['test'][m] = e

for a, b in [('gpt-4.1-mini', 'gpt-4.1'), ('gpt-4.1-mini', 'tiered'), ('tiered', 'gpt-4.1')]:
    for p in PASSES:
        if (a, p) in items5 and (b, p) in items5:
            an['test'][f'{a}_vs_{b}_{p}'] = pairs(items5[(a, p)], items5[(b, p)])

# ---------------- The regression: objection recall over the mini-first runs
RUNS = [('dev', None), ('gpt-4.1-mini', 'p1'), ('gpt-4.1-mini', 'p2'), ('tiered', 'p1'), ('tiered', 'p2')]
def runItems(rnd, m, p):
    base = {3: R3, 4: R4, 5: R5}[rnd]
    j = load(f'{base}/analysis-dev-gpt-4.1-mini.json' if m == 'dev' else f'{base}/analysis-{m}-{p}.json')
    return j['items'] if j else None
pool = {}
for rnd in (3, 4, 5):
    d = {}
    for m, p in RUNS:
        it = runItems(rnd, m, p)
        if it is None: d = None; break
        for cid, v in objc(it).items(): d[f"{m if m == 'dev' else m + '-' + p}:{cid}"] = v
    pool[rnd] = d
reg = {'runs': ['DEV (current contract in r5)', 'mini p1', 'mini p2', 'tiered p1', 'tiered p2']}
if pool[5]:
    for rnd in (3, 4, 5): reg[f'r{rnd}'] = f"{sum(pool[rnd].values())}/{len(pool[rnd])}"
    reg['r4_vs_r5_runCallPairs'] = mcnemar(pool[4], pool[5])
    reg['r3_vs_r5_runCallPairs'] = mcnemar(pool[3], pool[5])
    # distinct calls: a call is better in a round if it keeps its objection in more of its runs
    calls = sorted({k.split(':', 1)[1] for k in pool[5]})
    per = {c: {r: sum(v for k, v in pool[r].items() if k.split(':', 1)[1] == c) for r in (4, 5)} for c in calls}
    better5 = [c for c in calls if per[c][5] > per[c][4]]; better4 = [c for c in calls if per[c][4] > per[c][5]]
    nn = len(better5) + len(better4); kk = min(len(better5), len(better4))
    reg['distinctCalls_r4_vs_r5'] = {'betterInR5': better5, 'betterInR4': better4,
                                     'signTestP': round(1.0 if nn == 0 else min(1.0, 2 * sum(math.comb(nn, i) for i in range(kk + 1)) / 2 ** nn), 4)}
    reg['lostInR4_runByRun'] = {c: {k.split(':', 1)[0]: {'r3': pool[3].get(k), 'r4': pool[4].get(k), 'r5': pool[5].get(k)}
                                    for k in pool[5] if k.split(':', 1)[1] == c} for c in LOST_R4}
    reg['lostInR4_allBack'] = all(v['r5'] for c in LOST_R4 for v in reg['lostInR4_runByRun'][c].values())
    reg['newMissesInR5'] = sorted(k for k, v in pool[5].items() if not v)
    reg['fixed_preRegistered'] = sum(pool[5].values()) >= 50 and reg['lostInR4_allBack']
    # mini's own records only: drop (run, call) pairs escalated to gpt-4.1 in either round (the escalated record counts)
    def escalated(rnd):
        base = {4: R4, 5: R5}[rnd]; s = set()
        for p in PASSES:
            j = load(f'{base}/analysis-tiered-{p}.json')
            s |= {f'tiered-{p}:' + x['id'] for x in j['items'] if x.get('tier') and x['tier']['escalated']}
        return s
    esc = escalated(4) | escalated(5)
    a4 = {k: v for k, v in pool[4].items() if k not in esc}; a5 = {k: v for k, v in pool[5].items() if k not in esc}
    reg['miniRecordsOnly'] = {'excluded_escalatedInEitherRound': sorted(k for k in esc if k in pool[5]),
                              'r4': f'{sum(a4.values())}/{len(a4)}', 'r5': f'{sum(a5.values())}/{len(a5)}', 'mcnemar': mcnemar(a4, a5)}
an['regression'] = reg

# Outcome on mini single, pooled over DEV (current) + TEST p1 + p2, round 4 -> round 5 [exploratory: not pre-registered;
# (run, call) pairs share call ids across passes, so they are not independent; a sign test on distinct calls is given too]
poolo = {}
for rnd in (4, 5):
    d = {}
    for m, p in [('dev', None), ('gpt-4.1-mini', 'p1'), ('gpt-4.1-mini', 'p2')]:
        it = runItems(rnd, m, p)
        if it is None: d = None; break
        for cid, v in ok(it).items(): d[f"{m if m == 'dev' else m + '-' + p}:{cid}"] = v
    poolo[rnd] = d
if poolo[5]:
    calls = sorted({k.split(':', 1)[1] for k in poolo[5]})
    per = {c: {r: sum(v for k, v in poolo[r].items() if k.split(':', 1)[1] == c) for r in (4, 5)} for c in calls}
    b5 = [c for c in calls if per[c][5] > per[c][4]]; b4 = [c for c in calls if per[c][4] > per[c][5]]
    nn = len(b5) + len(b4); kk = min(len(b5), len(b4))
    an['miniOutcomePooled_exploratory'] = {'runs': 'DEV (current) + mini TEST p1 + p2', 'r4': f"{sum(poolo[4].values())}/{len(poolo[4])}", 'r5': f"{sum(poolo[5].values())}/{len(poolo[5])}",
        'mcnemar_runCallPairs': mcnemar(poolo[4], poolo[5]),
        'distinctCalls': {'betterInR5': b5, 'betterInR4': b4, 'signTestP': round(1.0 if nn == 0 else min(1.0, 2 * sum(math.comb(nn, i) for i in range(kk + 1)) / 2 ** nn), 4)},
        'byTemplate_r5': {t: f"{sum(poolo[5][k] for k in poolo[5] if k.split(':', 1)[1].startswith(t + '.'))}/{sum(1 for k in poolo[5] if k.split(':', 1)[1].startswith(t + '.'))}" for t in ('complaint', 'wrong_person')},
        'byTemplate_r4': {t: f"{sum(poolo[4][k] for k in poolo[4] if k.split(':', 1)[1].startswith(t + '.'))}/{sum(1 for k in poolo[4] if k.split(':', 1)[1].startswith(t + '.'))}" for t in ('complaint', 'wrong_person')},
        'preRegisteredClause': 'each mini-first TEST pass outcome >= 40/42',
        'preRegisteredClauseMet': {p: an['test']['gpt-4.1-mini'][p]['metrics']['outcomeK'] >= 40 for p in PASSES} if 'gpt-4.1-mini' in an['test'] else None}

# 3-minute call cost. (a) ANALYSIS-COST.md's token model: mini Rs 0.073, gpt-4.1 Rs 0.38, tiered 0.073 + e x 0.38 with
# e = escalated / model-analysed calls. (b) [inference] re-based on this round's measured prompt: input = (bench input per
# call - 100 bench transcript tokens) + 700 transcript tokens; output = bench output per call. When gpt-4.1 single did
# not run this round, (b) for gpt-4.1 takes this round's mini input per call and round 4's gpt-4.1 output per call.
RATE = {'gpt-4.1-mini': (41.8, 167.2), 'gpt-4.1': (190, 760)}
def c3(model, inp, outp): return (inp * RATE[model][0] + outp * RATE[model][1]) / 1e6
tok = {}
for m in ('gpt-4.1-mini', 'gpt-4.1'):
    if all((m, p) in items5 for p in PASSES):
        ins = [an['test'][m][p]['tokens']['r5']['inPerCall'] for p in PASSES]; outs = [an['test'][m][p]['tokens']['r5']['outPerCall'] for p in PASSES]
        tok[m] = (sum(ins) / 2, sum(outs) / 2)
cost3 = {}
if 'gpt-4.1-mini' in tok:
    g41 = tok.get('gpt-4.1') or (tok['gpt-4.1-mini'][0], 175.45)
    mini3b = c3('gpt-4.1-mini', tok['gpt-4.1-mini'][0] - 100 + 700, tok['gpt-4.1-mini'][1])
    g3b = c3('gpt-4.1', g41[0] - 100 + 700, g41[1])
    cost3 = {'model_a_ANALYSIS-COST.md': {'gpt-4.1-mini': 0.073, 'gpt-4.1': 0.38},
             'model_b_rebased': {'gpt-4.1-mini': round(mini3b, 4), 'gpt-4.1': round(g3b, 4), 'tokensPerCall_meanOfPasses': tok,
                                 'gpt-4.1_tokens_source': 'this round' if 'gpt-4.1' in tok else "mini's input per call this round, round 4's gpt-4.1 output per call (175.45)"}}
    if all(('tiered', p) in items5 for p in PASSES):
        es = [an['test']['tiered'][p]['escalation']['escalated'] / an['test']['tiered'][p]['escalation']['analysed'] for p in PASSES]
        cost3['tiered'] = {'e': [round(x, 4) for x in es],
                           'a': [round(0.073 + x * 0.38, 4) for x in es], 'a_mean': round(0.073 + sum(es) / 2 * 0.38, 4),
                           'b': [round(mini3b + x * g3b, 4) for x in es], 'b_mean': round(mini3b + sum(es) / 2 * g3b, 4)}
an['cost3min'] = cost3

# cost per model-analysed call, per run (bench cost lines; tiered priced per model by post.py)
an['costPerCall'] = {}
for (m, p) in sorted(items5):
    e = an['test'][m][p]
    an['costPerCall'][f'{m}-{p}'] = e['costTiered']['inr'] / e['tier']['calls'] if m == 'tiered' else e['cost']['inrPerCall']
for a in ARMS:
    if a in an['dev']: an['costPerCall'][f'dev-{a}'] = an['dev'][a]['cost']['inrPerCall']
an['costPerCall'] = {k: round(v, 4) for k, v in an['costPerCall'].items()}

# reverse_if of decision.2026-10-23.analysis-default-mini-single
rev = {}
if all(('gpt-4.1-mini', p) in items5 for p in PASSES):
    mk = lambda m, key: [an['test'][m][p]['metrics'][key] for p in PASSES]
    for other in ('gpt-4.1', 'tiered'):
        if not all((other, p) in items5 for p in PASSES): continue
        r = {}
        for key in ('outcomeK', 'momentK', 'objectionK', 'commitmentK', 'allMomentsK'):
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
                'refusedByCap': sum(b['refusedByCap'] for b in sp.values())}, 'globalCap': GCAP,
                'prices': 'prices.ts list rates at Rs 95/$: gpt-4.1-mini Rs 41.8 in / 167.2 out per 1M tokens; gpt-4.1 Rs 190 / 760'}
json.dump(out, sys.stdout, indent=1, default=str)
