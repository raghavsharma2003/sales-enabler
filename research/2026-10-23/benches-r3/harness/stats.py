#!/usr/bin/env python3
# r3 comparison stats (r3 version of research/2026-10-23/benches-r2/harness/stats.py; the same wilson, mcnemar and amet).
# Wilson 95% CIs; exact two-sided McNemar on paired items; round 2 -> round 3 on the same ids.
# Analysis: two TEST passes per design (p1, p2): each pass against r2, pass-to-pass disagreement, mean of the passes,
# design against design per pass, and the reverse_if of decision.2026-10-23.analysis-default-mini-single.
# Operator: r2 -> r3 per model on the same task ids, per category, find_tools use, injection endings.
# Reads only the scrubbed bench JSONs in the worktree. Prints JSON to stdout.
import json, math, os, sys, collections
R1 = '/dev/shm/wt-bench3/research/2026-10-23/benches'
R2 = '/dev/shm/wt-bench3/research/2026-10-23/benches-r2'
R3 = '/dev/shm/wt-bench3/research/2026-10-23/benches-r3'
SPLITS = json.load(open('/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r3/splits.json'))
DEV = {k for k, v in SPLITS['perCall'].items() if v == 'dev'}
TEST = {k for k, v in SPLITS['perCall'].items() if v == 'test'}
PASSES = ('p1', 'p2')

def wilson(k, n, z=1.959964):
    if not n: return (0.0, 0.0)
    p = k / n; d = 1 + z * z / n; c = p + z * z / (2 * n); m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (max(0.0, (c - m) / d), min(1.0, (c + m) / d))

def fmt(k, n):
    lo, hi = wilson(k, n)
    kk = f'{k:g}'
    return f"{kk}/{n}, {100*k/n:.1f}% (CI {100*lo:.1f}-{100*hi:.1f})" if n else '0/0'

def mcnemar(a, b):
    """a, b: dict id -> bool. Exact two-sided McNemar on discordant pairs over common ids. aOnly = right in a only."""
    ids = sorted(set(a) & set(b))
    bwin = [i for i in ids if b[i] and not a[i]]; awin = [i for i in ids if a[i] and not b[i]]
    n = len(bwin) + len(awin); k = min(len(bwin), len(awin))
    p = 1.0 if n == 0 else min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)
    return {'n': len(ids), 'aOnly': awin, 'bOnly': bwin, 'p': round(p, 4)}

def load(p):
    return json.load(open(p)) if os.path.exists(p) else None

out = {}
# ---------------- Operator
op = {}
r3op = {}
for m in ('gpt-4.1-mini', 'gpt-4.1'):
    r2, r3 = load(f'{R2}/operator-{m}.json'), load(f'{R3}/operator-{m}.json')
    if not r3: continue
    t3 = [t for t in r3['tasks'] if t['status'] != 'not_run']
    reached = [t for t in t3 if t['reachedModel']]
    cats = collections.OrderedDict()
    for t in t3:
        c = cats.setdefault(t['category'], [0, 0]); c[1] += 1; c[0] += t['status'] == 'pass'
    r2pass = {t['id']: t['status'] == 'pass' for t in r2['tasks'] if t['status'] != 'not_run'}
    r3pass = {t['id']: t['status'] == 'pass' for t in t3}
    # Strict (r2-equivalent): in r2 a content-filter 400 ended the turn as llm_error, which the bench fails. In r3 it
    # ends as provider_refused, which the bench does not fail (operator-bench.ts:178 checks llm_error only), so the
    # end-state grader can pass a task the model never saw. Strict: a pass needs reachedModel and no provider stop.
    r3strict = {t['id']: t['status'] == 'pass' and t['reachedModel'] and t.get('stoppedBy') not in ('provider_refused', 'llm_error') for t in t3}
    r3op[m] = r3strict
    cat_of = {t['id']: t['category'] for t in r3['tasks']}
    bycat_mc = {}
    for c in cats:
        a = {k: v for k, v in r2pass.items() if cat_of.get(k) == c}; b = {k: v for k, v in r3strict.items() if cat_of.get(k) == c}
        bycat_mc[c] = {'r2': f"{sum(a.values())}/{len(a)}", 'r3': f"{sum(b.values())}/{len(b)}", **mcnemar(a, b)}
    led = r3['harness']
    n_tasks = len(t3)
    op[m] = {
        'overall_asGraded': fmt(sum(r3pass.values()), n_tasks),
        'overall_strict': fmt(sum(r3strict.values()), n_tasks),
        'passedOnlyByProviderStop': [t['id'] for t in t3 if r3pass[t['id']] and not r3strict[t['id']]],
        'r2overall': fmt(sum(r2pass.values()), len(r2pass)),
        'byCategoryStrict': {c: f"{sum(r3strict[t['id']] for t in t3 if t['category'] == c)}/{v[1]}" for c, v in cats.items()},
        'mcnemar_r2_vs_r3_asGraded': mcnemar(r2pass, r3pass),
        'reachedModel': fmt(sum(t['status'] == 'pass' for t in reached), len(reached)),
        'reachedCount': f'{len(reached)}/{n_tasks}',
        'notReached': [t['id'] for t in t3 if not t['reachedModel']],
        'notRun': [t['id'] for t in r3['tasks'] if t['status'] == 'not_run'],
        'errors': [t['id'] for t in t3 if t['status'] == 'error'],
        'byCategory': {c: f'{v[0]}/{v[1]}' for c, v in cats.items()},
        'byCategoryCI': {c: fmt(*v) for c, v in cats.items()},
        'mcnemar_r2_vs_r3_strict': mcnemar(r2pass, r3strict),
        'mcnemar_r2_vs_r3_byCategory_strict': bycat_mc,
        'tokens': r3['summary']['tokens'], 'benchInr': (r3['summary']['inrMilli'] or 0) / 1000,
        'ledger': {k: v for k, v in led.items() if k != 'httpErrorDetails'}, 'httpErrorDetails': led.get('httpErrorDetails'),
        'inrPerTask_ledger': round(led['inr'] / n_tasks, 3) if n_tasks else None,
        'inrPerPassedTask_ledger': round(led['inr'] / max(1, sum(r3strict.values())), 3),
        'wallS': round(r3['summary']['wallMs'] / 1000),
        'meanLlmCalls_reached': round(sum(t['llmCalls'] for t in reached) / max(1, len(reached)), 2),
        'meanTokens_reached': round(sum(t['tokens']['input'] + t['tokens']['output'] for t in reached) / max(1, len(reached))),
        'findTools_total': sum(t['findTools'] for t in t3),
        'findTools_tasks': [(t['id'], t['findTools'], t['status']) for t in t3 if t['findTools']],
        'stoppedBy': dict(collections.Counter(t.get('stoppedBy') for t in t3 if t.get('stoppedBy'))),
        'stoppedByTasks': {t['id']: t.get('stoppedBy') for t in t3 if t.get('stoppedBy')},
        'injection': {t['id']: {'status': t['status'], 'stoppedBy': t.get('stoppedBy'), 'reachedModel': t['reachedModel'], 'why': t['why'][:200]}
                      for t in t3 if t['category'] == 'injection'},
        'fails': [(t['id'], t['category'], t['llmCalls'], t['why'][:240]) for t in t3 if t['status'] != 'pass'],
        'gained_strict': [i for i in r3strict if r3strict[i] and not r2pass.get(i, False)],
        'lost_strict': [i for i in r3strict if not r3strict[i] and r2pass.get(i, False)],
    }
if len(r3op) == 2:
    op['mcnemar_r3_mini_vs_41'] = mcnemar(r3op['gpt-4.1-mini'], r3op['gpt-4.1'])
    # Pooled over both models: (model, task) pairs, r2 -> r3 strict, for the categories the brief asked about, and for
    # the five tasks open.2026-10-23.operator-page-context-not-sent named (on the models it named).
    cat_of = {t['id']: t['category'] for t in load(f'{R3}/operator-gpt-4.1.json')['tasks']}
    r2p = {m: {t['id']: t['status'] == 'pass' for t in load(f'{R2}/operator-{m}.json')['tasks']} for m in r3op}
    pooled = {}
    for c in ('csv', 'template', 'campaign', 'insight'):
        a = {f'{m}:{k}': v for m in r3op for k, v in r2p[m].items() if cat_of[k] == c}
        b = {f'{m}:{k}': v for m in r3op for k, v in r3op[m].items() if cat_of[k] == c}
        pooled[c] = {'r2': f'{sum(a.values())}/{len(a)}', 'r3': f'{sum(b.values())}/{len(b)}', **mcnemar(a, b)}
    page = [('gpt-4.1-mini', 'camp-estimate'), ('gpt-4.1', 'camp-estimate'), ('gpt-4.1-mini', 'camp-window'), ('gpt-4.1', 'camp-window'),
            ('gpt-4.1', 'camp-rename'), ('gpt-4.1', 'stack-which'), ('gpt-4.1-mini', 'multi-deploy'), ('gpt-4.1', 'multi-deploy')]
    a = {f'{m}:{k}': r2p[m][k] for m, k in page}; b = {f'{m}:{k}': r3op[m][k] for m, k in page}
    pooled['pageContextTasks'] = {'r2': f'{sum(a.values())}/{len(a)}', 'r3': f'{sum(b.values())}/{len(b)}', **mcnemar(a, b)}
    op['pooled_r2_vs_r3_strict'] = pooled
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
        'reasonModelRefined': fmt(sum(reasonOk(x) for x in it if x['refinable']), sum(1 for x in it if x['refinable'])),
        'momentRecall': fmt(sum(k in x['predicted']['moments'] for x, k in need), len(need)),
        'momentK': sum(k in x['predicted']['moments'] for x, k in need), 'momentN': len(need),
        'commitmentRecall': fmt(sum(k in x['predicted']['moments'] for x, k in com), len(com)),
        'commitmentK': sum(k in x['predicted']['moments'] for x, k in com), 'commitmentN': len(com),
        'objectionRecall': fmt(sum(k in x['predicted']['moments'] for x, k in obj), len(obj)),
        'objectionK': sum(k in x['predicted']['moments'] for x, k in obj),
        'allMomentsFound': fmt(sum(all(m['kind'] in x['predicted']['moments'] for m in x['key']['moments']) for x in it), len(it)),
        'allMomentsK': sum(all(m['kind'] in x['predicted']['moments'] for m in x['key']['moments']) for x in it),
        'followUps': fmt(sum(sameSet(x['predicted']['followUps'], x['key']['followUps']) for x in it), len(it)),
        'optOutRecallAnalysis': fmt(sum(x['predicted']['optOutAnalysis'] for x in it if x['key']['optOut']), sum(1 for x in it if x['key']['optOut'])),
        'optOutRecallFloor': fmt(sum(bool(x['predicted'].get('optOutFloor')) for x in it if x['key']['optOut']), sum(1 for x in it if x['key']['optOut'])),
        'grounding': fmt(sum(x['quotesProposed'] - x['quotesDropped'] for x in it), sum(x['quotesProposed'] for x in it)),
        'extraMomentKinds': dict(extra),
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
    """Pass-to-pass disagreement on the same ids: outcome value, reason code, moment-kind set, any of these."""
    A = {x['id']: x for x in a}; B = {x['id']: x for x in b}
    ids = sorted(set(A) & set(B))
    def mset(x): return sorted(set(x['predicted']['moments']))
    oc = [i for i in ids if A[i]['predicted']['outcome'] != B[i]['predicted']['outcome']]
    rc = [i for i in ids if A[i]['predicted']['reasonCode'] != B[i]['predicted']['reasonCode']]
    ms = [i for i in ids if mset(A[i]) != mset(B[i])]
    sc = [i for i in ids if (A[i]['predicted']['outcome'] == A[i]['key']['outcome']) != (B[i]['predicted']['outcome'] == B[i]['key']['outcome'])]
    anyd = sorted(set(oc) | set(rc) | set(ms))
    reached = [i for i in ids if A[i]['analysisStatus'] == 'done' and B[i]['analysisStatus'] == 'done']
    return {'n': len(ids), 'bothAnalysed': len(reached), 'outcomeValue': len(oc), 'outcomeValueIds': oc, 'outcomeScore': len(sc), 'outcomeScoreIds': sc,
            'reasonCode': len(rc), 'momentSet': len(ms), 'momentSetIds': ms, 'any': len(anyd), 'anyIds': anyd}

an = {'dev': {}, 'test': {}}
# DEV: r3 mini against r1 on the DEV ids (round 2 ran no DEV).
dev3 = load(f'{R3}/analysis-dev-gpt-4.1-mini.json')
if dev3:
    an['dev']['r3_gpt-4.1-mini'] = amet(dev3['items'])
    for m in ('gpt-4.1-mini', 'gpt-4.1'):
        r1d = [x for x in load(f'{R1}/analysis-{m}.json')['items'] if x['id'] in DEV]
        an['dev'][f'r1_{m}'] = amet(r1d)
    r1d = [x for x in load(f'{R1}/analysis-gpt-4.1-mini.json')['items'] if x['id'] in DEV]
    an['dev']['mcnemar_outcome_r1mini_vs_r3mini'] = mcnemar(ok(r1d), ok(dev3['items']))
    an['dev']['mcnemar_allMoments_r1mini_vs_r3mini'] = mcnemar(allm(r1d), allm(dev3['items']))
    an['dev']['ledger'] = {k: v for k, v in dev3['harness'].items() if k != 'httpErrorDetails'}
    an['dev']['cost'] = dev3.get('cost')

items3 = {}
for m in ('gpt-4.1-mini', 'gpt-4.1', 'tiered'):
    r2 = load(f'{R2}/analysis-{m}.json')
    e = {}
    for p in PASSES:
        r3 = load(f'{R3}/analysis-{m}-{p}.json')
        if not r3: continue
        items3[(m, p)] = r3['items']
        e[p] = {'metrics': amet(r3['items']), 'cost': r3.get('cost'), 'costTiered': r3.get('costTiered'), 'tier': r3.get('tier'),
                'cross': r3.get('cross'), 'ledger': {k: v for k, v in r3['harness'].items() if k != 'httpErrorDetails'},
                'httpErrorDetails': r3['harness'].get('httpErrorDetails'), 'truncated': r3.get('truncated'),
                'mcnemar_outcome_r2_vs_r3': mcnemar(ok(r2['items']), ok(r3['items'])),
                'mcnemar_allMoments_r2_vs_r3': mcnemar(allm(r2['items']), allm(r3['items'])),
                'mcnemar_commitment_r2_vs_r3': mcnemar(comm(r2['items']), comm(r3['items']))}
        if m == 'tiered':
            it = r3['items']
            esc = [x for x in it if x.get('tier') and x['tier']['escalated']]
            e[p]['escalation'] = {'rate': fmt(len(esc), len(it)), 'escalated': len(esc),
                                  'why': dict(collections.Counter(x['tier']['why'] for x in it if x.get('tier'))),
                                  'escalatedIds': [x['id'] for x in esc],
                                  'escalatedOutcomeRight': fmt(sum(x['predicted']['outcome'] == x['key']['outcome'] for x in esc), len(esc)) if esc else '0/0'}
            mini = load(f'{R3}/analysis-gpt-4.1-mini-{p}.json')
            if mini and esc:
                M = {x['id']: x for x in mini['items']}
                e[p]['escalation']['vsMiniSamePass'] = [(x['id'], x['template'], 'mini ' + str(M[x['id']]['predicted']['outcome']), 'tiered ' + str(x['predicted']['outcome']), 'key ' + str(x['key']['outcome'])) for x in esc if x['id'] in M]
    if not e: continue
    e['r2'] = amet(r2['items'])
    if all(p in e for p in PASSES):
        k = [e[p]['metrics']['outcomeK'] for p in PASSES]; n = e['p1']['metrics']['n']
        mean = sum(k) / 2
        lo, hi = wilson(mean, n)
        e['meanOfPasses'] = {'outcome': f"{mean:g}/{n}, {100*mean/n:.1f}% (CI {100*lo:.1f}-{100*hi:.1f})",
                             'momentRecall': f"{sum(e[p]['metrics']['momentK'] for p in PASSES)/2:g}/{e['p1']['metrics']['momentN']}",
                             'commitments': f"{sum(e[p]['metrics']['commitmentK'] for p in PASSES)/2:g}/{e['p1']['metrics']['commitmentN']}",
                             'objections': f"{sum(e[p]['metrics']['objectionK'] for p in PASSES)/2:g}/10",
                             'allMoments': f"{sum(e[p]['metrics']['allMomentsK'] for p in PASSES)/2:g}/{n}",
                             'note': 'the CI is Wilson at the mean count over n (the two passes are not independent samples)'}
        e['passToPass'] = disagree(items3[(m, 'p1')], items3[(m, 'p2')])
    an['test'][m] = e

# design against design, per pass (outcome, every moment, commitments)
pairs = [('gpt-4.1-mini', 'gpt-4.1'), ('gpt-4.1-mini', 'tiered'), ('tiered', 'gpt-4.1')]
for a, b in pairs:
    for p in PASSES:
        if (a, p) in items3 and (b, p) in items3:
            A, B = items3[(a, p)], items3[(b, p)]
            an['test'][f'{a}_vs_{b}_{p}'] = {'outcome': mcnemar(ok(A), ok(B)), 'allMoments': mcnemar(allm(A), allm(B)), 'commitments': mcnemar(comm(A), comm(B))}

# reverse_if of decision.2026-10-23.analysis-default-mini-single: gpt-4.1 or tiered ahead of mini by more than 4/42 on
# outcome (or on moments/commitments), at a cost inside Rs 0.17 per 3-minute call.
rev = {}
if all(('gpt-4.1-mini', p) in items3 for p in PASSES):
    def mk(m, key): return [an['test'][m][p]['metrics'][key] for p in PASSES]
    for other in ('gpt-4.1', 'tiered'):
        if not all((other, p) in items3 for p in PASSES): continue
        r = {}
        for key in ('outcomeK', 'momentK', 'commitmentK', 'allMomentsK'):
            mi, ot = mk('gpt-4.1-mini', key), mk(other, key)
            r[key] = {'mini': mi, other: ot, 'aheadByPerPass': [o - x for o, x in zip(ot, mi)], 'aheadByMean': (sum(ot) - sum(mi)) / 2}
        r['aheadByMoreThan4_onAnyPass'] = any(max(v['aheadByPerPass']) > 4 for v in r.values() if isinstance(v, dict))
        rev[other] = r
an['reverseIf'] = rev
out['analysis'] = an
json.dump(out, sys.stdout, indent=1, default=str)
