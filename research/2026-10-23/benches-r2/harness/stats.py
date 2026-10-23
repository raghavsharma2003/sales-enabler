#!/usr/bin/env python3
# r2 comparison stats: Wilson 95% CIs, exact McNemar on paired items, r1 (TEST ids only for analysis) vs r2.
# Reads only the scrubbed bench JSONs in the worktree. Prints JSON to stdout.
import json, math, os, sys, collections
R1 = '/dev/shm/wt-bench2/research/2026-10-23/benches'
R2 = '/dev/shm/wt-bench2/research/2026-10-23/benches-r2'
SPLITS = json.load(open('/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-r2/splits.json'))
TEST = {k for k, v in SPLITS['perCall'].items() if v == 'test'}

def wilson(k, n, z=1.959964):
    if not n: return (0.0, 0.0)
    p = k / n; d = 1 + z * z / n; c = p + z * z / (2 * n); m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (max(0.0, (c - m) / d), min(1.0, (c + m) / d))

def fmt(k, n):
    lo, hi = wilson(k, n)
    return f"{k}/{n}, {100*k/n:.1f}% (CI {100*lo:.1f}-{100*hi:.1f})" if n else '0/0'

def mcnemar(a, b):
    """a, b: dict id -> bool. Exact two-sided McNemar on discordant pairs over common ids."""
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
for m in ('gpt-4.1-mini', 'gpt-4.1'):
    r1, r2 = load(f'{R1}/operator-{m}.json'), load(f'{R2}/operator-{m}.json')
    if not r2: continue
    t2 = [t for t in r2['tasks'] if t['status'] != 'not_run']
    reached = [t for t in t2 if t['reachedModel']]
    cats = collections.OrderedDict()
    for t in t2:
        c = cats.setdefault(t['category'], [0, 0]); c[1] += 1; c[0] += t['status'] == 'pass'
    r1strict = {t['id']: t['status'] == 'pass' and t.get('stoppedBy') != 'llm_error' for t in r1['tasks']}
    r1clean = {t['id']: t['status'] == 'pass' for t in r1['tasks'] if t.get('stoppedBy') != 'llm_error'}
    r2pass = {t['id']: t['status'] == 'pass' for t in t2}
    op[m] = {
        'overall': fmt(sum(r2pass.values()), len(t2)),
        'reachedModel': fmt(sum(t['status'] == 'pass' for t in reached), len(reached)),
        'notReached': [t['id'] for t in t2 if not t['reachedModel']],
        'errors': [t['id'] for t in t2 if t['status'] == 'error'],
        'llmErrorTasks': [t['id'] for t in t2 if t.get('stoppedBy') == 'llm_error'],
        'byCategory': {c: f'{v[0]}/{v[1]}' for c, v in cats.items()},
        'byCategoryCI': {c: fmt(*v) for c, v in cats.items()},
        'r1strict': fmt(sum(r1strict.values()), len(r1strict)),
        'r1answered': fmt(sum(r1clean.values()), len(r1clean)),
        'mcnemar_r1strict_vs_r2': mcnemar(r1strict, r2pass),
        'mcnemar_r1answered_vs_r2_on_r1answered': mcnemar(r1clean, {k: v for k, v in r2pass.items() if k in r1clean}),
        'previouslyBlocked_r2': fmt(sum(r2pass[k] for k in r2pass if k not in r1clean), sum(1 for k in r2pass if k not in r1clean)),
        'tokens': r2['summary']['tokens'], 'benchInr': (r2['summary']['inrMilli'] or 0) / 1000, 'ledger': r2['harness'],
        'wallS': round(r2['summary']['wallMs'] / 1000),
        'meanLlmCalls_reached': round(sum(t['llmCalls'] for t in reached) / max(1, len(reached)), 2),
        'meanTokens_reached': round(sum(t['tokens']['input'] + t['tokens']['output'] for t in reached) / max(1, len(reached))),
        'findTools': sum(t['findTools'] for t in t2),
        'stoppedBy': collections.Counter(t.get('stoppedBy') for t in t2 if t.get('stoppedBy')),
        'fails': [(t['id'], t['category'], t['llmCalls'], t['why'][:220]) for t in t2 if t['status'] != 'pass'],
    }
if len(op) == 2:
    a = {t['id']: t['status'] == 'pass' for t in load(f'{R2}/operator-gpt-4.1-mini.json')['tasks'] if t['status'] != 'not_run'}
    b = {t['id']: t['status'] == 'pass' for t in load(f'{R2}/operator-gpt-4.1.json')['tasks'] if t['status'] != 'not_run'}
    op['mcnemar_mini_vs_41'] = mcnemar(a, b)
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
        'reasonCode': fmt(sum(map(reasonOk, it)), len(it)),
        'reasonModelRefined': fmt(sum(reasonOk(x) for x in it if x['refinable']), sum(1 for x in it if x['refinable'])),
        'momentRecall': fmt(sum(k in x['predicted']['moments'] for x, k in need), len(need)),
        'commitmentRecall': fmt(sum(k in x['predicted']['moments'] for x, k in com), len(com)),
        'objectionRecall': fmt(sum(k in x['predicted']['moments'] for x, k in obj), len(obj)),
        'allMomentsFound': fmt(sum(all(m['kind'] in x['predicted']['moments'] for m in x['key']['moments']) for x in it), len(it)),
        'followUps': fmt(sum(sameSet(x['predicted']['followUps'], x['key']['followUps']) for x in it), len(it)),
        'optOutRecallAnalysis': fmt(sum(x['predicted']['optOutAnalysis'] for x in it if x['key']['optOut']), sum(1 for x in it if x['key']['optOut'])),
        'grounding': fmt(sum(x['quotesProposed'] - x['quotesDropped'] for x in it), sum(x['quotesProposed'] for x in it)),
        'extraMomentKinds': dict(extra),
        'outcomeMisses': collections.Counter(f"{x['key']['outcome']}->{x['predicted']['outcome']}" for x in it if x['predicted']['outcome'] != x['key']['outcome']),
        'outcomeMissIds': [x['id'] for x in it if x['predicted']['outcome'] != x['key']['outcome']],
        'reasonMisses': [(x['id'], x['key']['reasonCode'], x['predicted']['reasonCode']) for x in it if not reasonOk(x)],
        'momentMisses': [(x['id'], [m['kind'] for m in x['key']['moments'] if m['kind'] not in x['predicted']['moments']]) for x in it
                         if any(m['kind'] not in x['predicted']['moments'] for m in x['key']['moments'])],
        'status': collections.Counter(x['analysisStatus'] for x in it),
    }

an = {}
ok = lambda items: {x['id']: x['predicted']['outcome'] == x['key']['outcome'] for x in items}
allm = lambda items: {x['id']: all(m['kind'] in x['predicted']['moments'] for m in x['key']['moments']) for x in items}
r2items = {}
for m in ('gpt-4.1-mini', 'gpt-4.1', 'tiered'):
    r2 = load(f'{R2}/analysis-{m}.json')
    if not r2: continue
    r2items[m] = r2['items']
    e = {'r2': amet(r2['items']), 'cost': r2.get('cost'), 'costTiered': r2.get('costTiered'), 'tier': r2.get('tier'), 'cross': r2.get('cross'),
         'ledger': {k: v for k, v in r2['harness'].items() if k != 'httpErrorDetails'}, 'truncated': r2.get('truncated')}
    base = 'gpt-4.1-mini' if m == 'tiered' else m
    r1 = load(f'{R1}/analysis-{base}.json')
    r1t = [x for x in r1['items'] if x['id'] in TEST]
    e['r1_test_ids'] = amet(r1t)
    e['mcnemar_outcome_r1_vs_r2'] = mcnemar(ok(r1t), ok(r2['items']))
    e['mcnemar_allMoments_r1_vs_r2'] = mcnemar(allm(r1t), allm(r2['items']))
    if m == 'tiered':
        r141 = [x for x in load(f'{R1}/analysis-gpt-4.1.json')['items'] if x['id'] in TEST]
        e['r1_gpt41_test_ids'] = amet(r141)
        it = r2['items']
        esc = [x for x in it if x.get('tier') and x['tier']['escalated']]
        e['escalation'] = {'rate': fmt(len(esc), len(it)), 'why': dict(collections.Counter(x['tier']['why'] for x in esc)),
                           'escalatedIds': [x['id'] for x in esc],
                           'escalatedOutcomeRight': fmt(sum(x['predicted']['outcome'] == x['key']['outcome'] for x in esc), len(esc)) if esc else '0/0'}
    an[m] = e
pairs = [('gpt-4.1-mini', 'gpt-4.1'), ('gpt-4.1-mini', 'tiered'), ('tiered', 'gpt-4.1')]
for a, b in pairs:
    if a in r2items and b in r2items:
        an[f'mcnemar_outcome_{a}_vs_{b}'] = mcnemar(ok(r2items[a]), ok(r2items[b]))
        an[f'mcnemar_allMoments_{a}_vs_{b}'] = mcnemar(allm(r2items[a]), allm(r2items[b]))
out['analysis'] = an
json.dump(out, sys.stdout, indent=1, default=str)
