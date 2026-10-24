#!/usr/bin/env python3
# op5 comparison stats (Operator only). Reuses the r4 harness stats.py's wilson, mcnemar and strict definitions unchanged.
# Wilson 95% CIs; exact two-sided McNemar on paired task ids. Two runs per model on tree 08b5916:
#   - strict of 48 per run (a pass needs the grader's pass, reachedModel and no provider stop; not_measured and not_run
#     count as not passed, as in r4), strict of measured, the mean of the two runs per model;
#   - run-to-run agreement per model (r1 vs r2), mini vs gpt-4.1 per run, and each run against round 4 (one run per model);
#   - per category and for the focus tasks; the reverse_if of decision.2026-10-24.operator-default-gpt41;
#   - spend per run from the harness ledger, and brief-review requests from the recorder reports (rec.py).
# Reads the scrubbed bench JSONs in the worktree, the opdb.py and rec.py reports. Prints JSON to stdout.
import json, math, os, sys, collections
R4 = '/dev/shm/wt-op5/research/2026-10-24/benches-r4'
R5 = '/dev/shm/wt-op5/research/2026-10-24/benches-op5'
T = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-op5'
MODELS = ('gpt-4.1', 'gpt-4.1-mini')
RUNS = ('r1', 'r2')
FOCUS = ('ref-human', 'multi-deploy', 'edit-duration', 'camp-estimate', 'amb-campaign')
FOCUS_CATS = ('csv', 'campaign', 'template')
RATE = {'gpt-4.1': (190, 760), 'gpt-4.1-mini': (41.8, 167.2)}

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

STOPS = ('provider_refused', 'llm_error')
def strict(tasks):
    return {t['id']: t['status'] == 'pass' and t['reachedModel'] and t.get('stoppedBy') not in STOPS for t in tasks}

out = {'tree': '08b5916872626158b7f00439e1ea2d2db2891d2d', 'baseline': 'round 4, tree 8e3440a (research/2026-10-24/benches-r4), one run per model'}
# cbe7971 changed camp-estimate's grader (the reply must quote both ends of the estimate). Round 4's final replies (r4 DB
# extracts, bench-tools-r4/opdb-*.json) regraded by that rule: gpt-4.1 "₹9.61 and ₹24.02" still passes; mini "₹9,608 and
# ₹24,021" fails. The *_r4regraded tests use this; the plain ones use round 4 as it was graded.
R4_REGRADE = {'gpt-4.1': {}, 'gpt-4.1-mini': {'camp-estimate': False}}
runs, s5, cat_of = {}, {}, {}
for m in MODELS:
    r4 = load(f'{R4}/operator-{m}.json')
    a4 = strict(r4['tasks'])
    a4g = {**a4, **R4_REGRADE[m]}
    for r in RUNS:
        j = load(f'{R5}/operator-{m}-{r}.json')
        if not j: continue
        t5 = j['tasks']; cat_of.update({t['id']: t['category'] for t in t5})
        a5 = strict(t5); s5[(m, r)] = a5
        nm = [t['id'] for t in t5 if t['status'] == 'not_measured']
        nr = [t['id'] for t in t5 if t['status'] == 'not_run']
        measured = [t for t in t5 if t['status'] not in ('not_measured', 'not_run')]
        reached = [t for t in measured if t['reachedModel']]
        led = j['harness']
        cats = list(dict.fromkeys(t['category'] for t in t5))
        db = load(f'{T}/opdb-{m}-{r}.json'); rec = load(f'{T}/rec-{m}-{r}.json')
        rv = rec['summary']['reviews'] if rec else None
        # brief-review spend: the recorder holds each tool-less reply's usage; priced at this run's rates
        revTok = [0, 0]
        if rec:
            for l in open(f'{T}/record-{m}-{r}.jsonl'):
                x = json.loads(l)
                if not x['tools'] and any(mm.get('head', '').startswith('You review the instruction text') for mm in x['msgs'] if mm['role'] == 'system') and x.get('usage'):
                    revTok[0] += x['usage'].get('prompt_tokens', 0); revTok[1] += x['usage'].get('completion_tokens', 0)
        runs[f'{m}-{r}'] = {
            'strict_of48': fmt(sum(a5.values()), len(t5)), 'strictK': sum(a5.values()), 'n': len(t5),
            'strict_ofMeasured': fmt(sum(a5[t['id']] for t in measured), len(measured)),
            'asGraded': f"{j['summary']['passed']}/{j['summary']['run']}",
            'notMeasured': nm, 'notRun': nr, 'stoppedEarly': j['summary'].get('stoppedEarly'),
            'mcnemar_r4_vs_this_strict': mcnemar(a4, a5),
            'r4_strict': sum(a4.values()), 'r4_strict_regraded': sum(a4g.values()),
            'mcnemar_r4regraded_vs_this_strict': mcnemar(a4g, a5),
            'byCategory': {c: f"{sum(a5[t['id']] for t in t5 if t['category'] == c)}/{sum(1 for t in t5 if t['category'] == c)}" for c in cats},
            'byCategory_r4': {c: f"{sum(a4[t['id']] for t in r4['tasks'] if t['category'] == c)}/{sum(1 for t in r4['tasks'] if t['category'] == c)}" for c in cats},
            'focus': {k: {'pass': a5.get(k), 'r4': a4.get(k), 'why': next((t['why'] for t in t5 if t['id'] == k), '')[:260]} for k in FOCUS},
            'fails': [(t['id'], t['category'], t['llmCalls'], t['toolCalls'], t['why'][:200]) for t in t5 if not a5[t['id']]],
            'gained_vs_r4': [i for i in a5 if a5[i] and not a4.get(i)], 'lost_vs_r4': [i for i in a5 if not a5[i] and a4.get(i)],
            'reachedCount': f'{len(reached)}/{len(measured)} measured',
            'zeroToolCalls_reached': sorted(t['id'] for t in reached if t['toolCalls'] == 0),
            'meanLlmCalls_reached': round(sum(t['llmCalls'] for t in reached) / max(1, len(reached)), 2),
            'meanToolCalls_reached': round(sum(t['toolCalls'] for t in reached) / max(1, len(reached)), 2),
            'meanTokens_reached': round(sum(t['tokens']['input'] + t['tokens']['output'] for t in reached) / max(1, len(reached))),
            'r4_meanLlmCalls_reached': round(sum(t['llmCalls'] for t in r4['tasks'] if t['reachedModel']) / max(1, sum(1 for t in r4['tasks'] if t['reachedModel'])), 2),
            'r4_meanTokens_reached': round(sum(t['tokens']['input'] + t['tokens']['output'] for t in r4['tasks'] if t['reachedModel']) / max(1, sum(1 for t in r4['tasks'] if t['reachedModel']))),
            'findTools_total': sum(t['findTools'] for t in t5),
            'stoppedBy': dict(collections.Counter(t.get('stoppedBy') for t in t5 if t.get('stoppedBy'))),
            'ledger': {k: v for k, v in led.items() if k != 'httpErrorDetails'}, 'httpErrorDetails': led.get('httpErrorDetails'),
            'benchInr': (j['summary']['inrMilli'] or 0) / 1000,
            'inrPerTask_ledger': round(led['inr'] / max(1, len(t5) - len(nr)), 3),
            'inrPerStrictPass_ledger': round(led['inr'] / max(1, sum(a5.values())), 3),
            'wallS': round(j['summary']['wallMs'] / 1000),
            'db': db['summary'] if db else None,
            'recorder': rec['summary'] if rec else None,
            'briefReview': {'requests': rv['requests'] if rv else None, 'byMode': rv['byMode'] if rv else None,
                            'tokens': revTok, 'inr': round((revTok[0] * RATE[m][0] + revTok[1] * RATE[m][1]) / 1e6, 3)},
        }
    # run-to-run agreement
    if (m, 'r1') in s5 and (m, 'r2') in s5:
        a, b = s5[(m, 'r1')], s5[(m, 'r2')]
        ids = sorted(set(a) & set(b))
        both = sum(a[i] and b[i] for i in ids); neither = sum(not a[i] and not b[i] for i in ids)
        k = [sum(a.values()), sum(b.values())]; mean = sum(k) / 2; lo, hi = wilson(mean, len(ids))
        runs[f'{m}-agreement'] = {'n': len(ids), 'bothPass': both, 'bothFail': neither, 'agree': both + neither,
                                  'agreeRate': round((both + neither) / len(ids), 3), 'mcnemar_r1_vs_r2': mcnemar(a, b),
                                  'meanStrict': f"{mean:g}/{len(ids)}, {100*mean/len(ids):.1f}% (CI {100*lo:.1f}-{100*hi:.1f})", 'meanK': mean,
                                  'failedBoth': [i for i in ids if not a[i] and not b[i]],
                                  'note': 'the CI is Wilson at the mean count over n (the two runs are not independent samples)'}
out['runs'] = runs

pair = {}
for r in RUNS:
    if ('gpt-4.1', r) in s5 and ('gpt-4.1-mini', r) in s5:
        k41, km = sum(s5[('gpt-4.1', r)].values()), sum(s5[('gpt-4.1-mini', r)].values())
        pair[r] = {'gpt-4.1': k41, 'gpt-4.1-mini': km, 'gap': k41 - km, 'withinTwo': (k41 - km) <= 2,
                   'mcnemar_mini_vs_41': mcnemar(s5[('gpt-4.1-mini', r)], s5[('gpt-4.1', r)])}
out['miniVs41'] = pair
# Pooled over the two runs per model, (run, task) pairs: mini vs gpt-4.1 (paired by run number)
if len(pair) == 2:
    A = {f'{r}:{k}': v for r in RUNS for k, v in s5[('gpt-4.1-mini', r)].items()}; B = {f'{r}:{k}': v for r in RUNS for k, v in s5[('gpt-4.1', r)].items()}
    out['miniVs41_pooledRuns'] = {'mini': sum(A.values()), 'gpt-4.1': sum(B.values()), 'n': len(A), **mcnemar(A, B),
                                  'note': '(run, task) pairs are not independent across runs'}
out['reverseIf_operator_default_gpt41'] = {
    'rule': 'gpt-4.1-mini within 2/48 of gpt-4.1 strict on two runs, with no safety-relevant failure (a brief edit that breaks the AI-disclosure rule, a claimed write that did not happen)',
    'perRun': {r: {'gap': v['gap'], 'withinTwo': v['withinTwo']} for r, v in pair.items()},
    'marginMetOnBothRuns': len(pair) == 2 and all(v['withinTwo'] for v in pair.values()),
    'safety': 'see README (manual review of every reply and brief write)'}

# per category, all four runs side by side
cats = list(dict.fromkeys(cat_of.values()))
out['byCategoryAllRuns'] = {c: {f'{m}-{r}': runs[f'{m}-{r}']['byCategory'][c] for m in MODELS for r in RUNS if f'{m}-{r}' in runs} | {f'{m}-r4': runs.get(f'{m}-r1', {}).get('byCategory_r4', {}).get(c) for m in MODELS} for c in cats}
out['focusAllRuns'] = {k: {f'{m}-{r}': s5[(m, r)].get(k) for m in MODELS for r in RUNS if (m, r) in s5} for k in FOCUS}

# Diagnostic ablation (not in any score): gpt-4.1 on 08b5916 with the conduct line at operator/loop.ts:112 removed
# (harness/abl.sh), on the tasks that replied with zero tool calls in both scored gpt-4.1 runs. A task cut by the cap
# (model error from the guard) or not started is excluded.
ab = load(f'{R5}/operator-abl-gpt-4.1.json')
if ab:
    cut = [t['id'] for t in ab['tasks'] if t['status'] == 'not_run' or 'spend cap' in t['why']]
    ids = [t['id'] for t in ab['tasks'] if t['id'] not in cut]
    called = {t['id']: t['toolCalls'] > 0 for t in ab['tasks'] if t['id'] in ids}
    sa = strict(ab['tasks'])
    sc = {r: {t['id']: t for t in load(f'{R5}/operator-gpt-4.1-{r}.json')['tasks']} for r in RUNS}
    out['ablation_conduct_line'] = {
        'tasks': ids, 'cutByCap': cut,
        'calledATool': {'ablation': sum(called.values()), **{r: sum(sc[r][i]['toolCalls'] > 0 for i in ids) for r in RUNS}, 'n': len(ids)},
        'strictPass': {'ablation': sum(sa[i] for i in ids), **{r: sum(s5[('gpt-4.1', r)][i] for i in ids) for r in RUNS}, 'n': len(ids)},
        'mcnemar_calledATool_r1_vs_ablation': mcnemar({i: sc['r1'][i]['toolCalls'] > 0 for i in ids}, called),
        'mcnemar_strict_r1_vs_ablation': mcnemar({i: s5[('gpt-4.1', 'r1')][i] for i in ids}, {i: sa[i] for i in ids}),
        'whyFailed': {t['id']: t['why'][:160] for t in ab['tasks'] if not sa[t['id']]},
        'ledgerInr': ab['harness']['inr'], 'requests': ab['harness']['requests']}

rows = [json.loads(l) for l in open(f'{T}/ledger.jsonl')]
sp = collections.OrderedDict()
for x in rows:
    b = sp.setdefault(x['run'], {'requests': 0, 'inr': 0.0, 'httpErrors': 0, 'retries429': 0, 'refusedByCap': 0, 'networkErrors': 0})
    if x['event'] == 'ok': b['requests'] += 1; b['inr'] += x['inr']
    elif x['event'] == 'http_error': b['httpErrors'] += 1
    elif x['event'] == 'retry_429': b['retries429'] += 1
    elif x['event'] == 'network_error': b['networkErrors'] += 1
    elif x['event'].startswith('refused'): b['refusedByCap'] += 1
for b in sp.values(): b['inr'] = round(b['inr'], 2)
out['spend'] = {'byRun': sp, 'total': {'requests': sum(b['requests'] for b in sp.values()), 'inr': round(sum(x.get('inr', 0) for x in rows if x['event'] == 'ok'), 2)},
                'globalCap': 280, 'prices': 'prices.ts list rates at Rs 95/$: gpt-4.1-mini Rs 41.8 in / 167.2 out per 1M tokens; gpt-4.1 Rs 190 / 760'}
json.dump(out, sys.stdout, indent=1, default=str)
