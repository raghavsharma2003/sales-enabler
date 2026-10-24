#!/usr/bin/env python3
# op6 comparison stats (Operator only). op5's stats.py (research/2026-10-24/benches-op5/harness/stats.py) with these
# changes: the baseline is op5 (two runs per model on 08b5916), so each op6 run is paired with the op5 run of the same
# number, and pooled over (run, task) pairs; op5 is also regraded by 6fd8da5's cap-set / cap-raise card-amount rule
# (from op5's recorded card arguments: only mini's cap-raise flips, Rs 200 card for Rs 2,000, both runs); the ablation
# section is gone; the reverse_if section is decision.2026-10-24.operator-default-symmetric-rule's; global cap 300.
# wilson, mcnemar and strict are op5's (and r4's) unchanged.
# Reads the scrubbed bench JSONs in the worktree, the opdb.py and rec.py reports, and safety.json (the hand count under
# harness/select-rule.txt). Prints JSON to stdout.
import json, math, os, sys, collections
OP5 = '/dev/shm/wt-op6/research/2026-10-24/benches-op5'
OP6 = '/dev/shm/wt-op6/research/2026-10-24/benches-op6'
T = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-op6'
MODELS = ('gpt-4.1', 'gpt-4.1-mini')
RUNS = ('r1', 'r2')
WRITE_TASKS = set('''agent-dental agent-emi agent-feedback agent-sitevisit agent-webinar agent-cod tpl-name tpl-nodiscount edit-hindi
edit-fact edit-calmer edit-duration stack-sarvam stack-s2s stack-built stack-built-s2s csv-audience csv-pune csv-consent
camp-draft-estimate camp-launch camp-window camp-rename cap-set cap-lower cap-raise multi-agent-publish
multi-audience-campaign multi-template-limits multi-deploy multi-cap-balance'''.split())   # select-rule.txt
FOCUS = ('edit-hindi', 'edit-duration', 'multi-template-limits', 'cap-raise', 'ref-delete', 'ref-human', 'amb-campaign', 'multi-deploy', 'edit-fact', 'csv-consent')
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

# 6fd8da5 regrade of op5 (grading only): cap-set needs a Rs 500 card (op5: every run's card was 500000, unchanged);
# cap-raise needs a Rs 2,000 card (op5 gpt-4.1: 2000000 both runs, unchanged; op5 mini: 200000 both runs -> fail).
OP5_REGRADE = {'gpt-4.1': {}, 'gpt-4.1-mini': {'cap-raise': False}}

out = {'tree': 'a9c58df972664b136de757aecbbee9ac011a5b7d', 'baseline': 'op5, tree 08b5916 (research/2026-10-24/benches-op5), two runs per model'}
runs, s6, cat_of, t6s = {}, {}, {}, {}
for m in MODELS:
    for r in RUNS:
        o5 = load(f'{OP5}/operator-{m}-{r}.json')
        a5 = strict(o5['tasks']); a5g = {**a5, **OP5_REGRADE[m]}
        j = load(f'{OP6}/operator-{m}-{r}.json')
        if not j: continue
        t6 = j['tasks']; t6s[(m, r)] = {t['id']: t for t in t6}; cat_of.update({t['id']: t['category'] for t in t6})
        a6 = strict(t6); s6[(m, r)] = a6
        nm = [t['id'] for t in t6 if t['status'] == 'not_measured']
        nr = [t['id'] for t in t6 if t['status'] == 'not_run']
        measured = [t for t in t6 if t['status'] not in ('not_measured', 'not_run')]
        reached = [t for t in measured if t['reachedModel']]
        led = j['harness']
        cats = list(dict.fromkeys(t['category'] for t in t6))
        db = load(f'{T}/opdb-{m}-{r}.json'); rec = load(f'{T}/rec-{m}-{r}.json')
        rv = rec['summary']['reviews'] if rec else None
        revTok = [0, 0]
        if rec:
            for l in open(f'{T}/record-{m}-{r}.jsonl'):
                x = json.loads(l)
                if not x['tools'] and any(mm.get('head', '').startswith('You review the instruction text') for mm in x['msgs'] if mm['role'] == 'system') and x.get('usage'):
                    revTok[0] += x['usage'].get('prompt_tokens', 0); revTok[1] += x['usage'].get('completion_tokens', 0)
        zt_write = sorted(t['id'] for t in reached if t['toolCalls'] == 0 and t['id'] in WRITE_TASKS)
        runs[f'{m}-{r}'] = {
            'strict_of48': fmt(sum(a6.values()), len(t6)), 'strictK': sum(a6.values()), 'n': len(t6),
            'strict_ofMeasured': fmt(sum(a6[t['id']] for t in measured), len(measured)),
            'asGraded': f"{j['summary']['passed']}/{j['summary']['run']}",
            'notMeasured': nm, 'notRun': nr, 'stoppedEarly': j['summary'].get('stoppedEarly'),
            'op5_strict': sum(a5.values()), 'op5_strict_regraded': sum(a5g.values()),
            'mcnemar_op5_vs_op6_strict': mcnemar(a5, a6),
            'mcnemar_op5regraded_vs_op6_strict': mcnemar(a5g, a6),
            'byCategory': {c: f"{sum(a6[t['id']] for t in t6 if t['category'] == c)}/{sum(1 for t in t6 if t['category'] == c)}" for c in cats},
            'byCategory_op5': {c: f"{sum(a5[t['id']] for t in o5['tasks'] if t['category'] == c)}/{sum(1 for t in o5['tasks'] if t['category'] == c)}" for c in cats},
            'focus': {k: {'pass': a6.get(k), 'op5': a5.get(k), 'why': next((t['why'] for t in t6 if t['id'] == k), '')[:260]} for k in FOCUS},
            'fails': [(t['id'], t['category'], t['llmCalls'], t['toolCalls'], t['why'][:200]) for t in t6 if not a6[t['id']]],
            'gained_vs_op5': [i for i in a6 if a6[i] and not a5.get(i)], 'lost_vs_op5': [i for i in a6 if not a6[i] and a5.get(i)],
            'reachedCount': f'{len(reached)}/{len(measured)} measured',
            'zeroToolCalls_reached': sorted(t['id'] for t in reached if t['toolCalls'] == 0),
            'zeroToolFinal_onWriteTask': zt_write, 'zeroToolFinal_onWriteTask_n': len(zt_write),
            'op5_zeroToolFinal_onWriteTask': sorted(t['id'] for t in o5['tasks'] if t['reachedModel'] and t['toolCalls'] == 0 and t['id'] in WRITE_TASKS and t['status'] not in ('not_measured', 'not_run')),
            'meanLlmCalls_reached': round(sum(t['llmCalls'] for t in reached) / max(1, len(reached)), 2),
            'meanToolCalls_reached': round(sum(t['toolCalls'] for t in reached) / max(1, len(reached)), 2),
            'meanTokens_reached': round(sum(t['tokens']['input'] + t['tokens']['output'] for t in reached) / max(1, len(reached))),
            'op5_meanLlmCalls_reached': round(sum(t['llmCalls'] for t in o5['tasks'] if t['reachedModel']) / max(1, sum(1 for t in o5['tasks'] if t['reachedModel'])), 2),
            'op5_meanTokens_reached': round(sum(t['tokens']['input'] + t['tokens']['output'] for t in o5['tasks'] if t['reachedModel']) / max(1, sum(1 for t in o5['tasks'] if t['reachedModel']))),
            'findTools_total': sum(t['findTools'] for t in t6),
            'stoppedBy': dict(collections.Counter(t.get('stoppedBy') for t in t6 if t.get('stoppedBy'))),
            'ledger': {k: v for k, v in led.items() if k != 'httpErrorDetails'}, 'httpErrorDetails': led.get('httpErrorDetails'),
            'benchInr': (j['summary']['inrMilli'] or 0) / 1000,
            'inrPerTask_ledger': round(led['inr'] / max(1, len(t6) - len(nr)), 3),
            'inrPerStrictPass_ledger': round(led['inr'] / max(1, sum(a6.values())), 3),
            'wallS': round(j['summary']['wallMs'] / 1000),
            'db': db['summary'] if db else None,
            'recorder': rec['summary'] if rec else None,
            'briefReview': {'requests': rv['requests'] if rv else None, 'byMode': rv['byMode'] if rv else None,
                            'tokens': revTok, 'inr': round((revTok[0] * RATE[m][0] + revTok[1] * RATE[m][1]) / 1e6, 3)},
        }
    if (m, 'r1') in s6 and (m, 'r2') in s6:
        a, b = s6[(m, 'r1')], s6[(m, 'r2')]
        ids = sorted(set(a) & set(b))
        both = sum(a[i] and b[i] for i in ids); neither = sum(not a[i] and not b[i] for i in ids)
        k = [sum(a.values()), sum(b.values())]; mean = sum(k) / 2; lo, hi = wilson(mean, len(ids))
        o5 = {r: strict(load(f'{OP5}/operator-{m}-{r}.json')['tasks']) for r in RUNS}
        o5g = {r: {**o5[r], **OP5_REGRADE[m]} for r in RUNS}
        A5 = {f'{r}:{i}': v for r in RUNS for i, v in o5[r].items()}; A5g = {f'{r}:{i}': v for r in RUNS for i, v in o5g[r].items()}
        A6 = {f'{r}:{i}': v for r in RUNS for i, v in s6[(m, r)].items()}
        runs[f'{m}-agreement'] = {'n': len(ids), 'bothPass': both, 'bothFail': neither, 'agree': both + neither,
                                  'agreeRate': round((both + neither) / len(ids), 3), 'mcnemar_r1_vs_r2': mcnemar(a, b),
                                  'meanStrict': f"{mean:g}/{len(ids)}, {100*mean/len(ids):.1f}% (CI {100*lo:.1f}-{100*hi:.1f})", 'meanK': mean, 'sumK': sum(k),
                                  'failedBoth': [i for i in ids if not a[i] and not b[i]],
                                  'op5_meanK': (sum(o5['r1'].values()) + sum(o5['r2'].values())) / 2,
                                  'op5_meanK_regraded': (sum(o5g['r1'].values()) + sum(o5g['r2'].values())) / 2,
                                  'mcnemar_op5_vs_op6_pooledRuns': {**mcnemar(A5, A6), 'note': '(run, task) pairs, op5 rN with op6 rN; not independent'},
                                  'mcnemar_op5regraded_vs_op6_pooledRuns': mcnemar(A5g, A6),
                                  'note': 'the CI is Wilson at the mean count over n (the two runs are not independent samples)'}
out['runs'] = runs

pair = {}
for r in RUNS:
    if ('gpt-4.1', r) in s6 and ('gpt-4.1-mini', r) in s6:
        k41, km = sum(s6[('gpt-4.1', r)].values()), sum(s6[('gpt-4.1-mini', r)].values())
        pair[r] = {'gpt-4.1': k41, 'gpt-4.1-mini': km, 'gap41minusMini': k41 - km, 'mcnemar_mini_vs_41': mcnemar(s6[('gpt-4.1-mini', r)], s6[('gpt-4.1', r)])}
out['miniVs41'] = pair
if len(pair) == 2:
    A = {f'{r}:{k}': v for r in RUNS for k, v in s6[('gpt-4.1-mini', r)].items()}; B = {f'{r}:{k}': v for r in RUNS for k, v in s6[('gpt-4.1', r)].items()}
    out['miniVs41_pooledRuns'] = {'mini': sum(A.values()), 'gpt-4.1': sum(B.values()), 'n': len(A), **mcnemar(A, B),
                                  'note': '(run, task) pairs are not independent across runs'}

# Common set (select-rule.txt): task ids every one of the four runs ran with the model reached.
if len(s6) == 4:
    # a task the harness cap cut mid-turn (the guard refused a request: llm_error 'spend cap') counts as not run
    cut = lambda t: t.get('stoppedBy') == 'llm_error' and 'spend cap' in t['why']
    common = sorted(i for i in s6[('gpt-4.1', 'r1')] if all(t6s[k][i]['status'] not in ('not_run', 'not_measured') and t6s[k][i]['reachedModel'] and not cut(t6s[k][i]) for k in s6))
    out['cutByCap'] = {f'{m}-{r}': [i for i, t in t6s[(m, r)].items() if cut(t)] for (m, r) in s6}
    out['commonSet'] = {'n': len(common), 'excluded': sorted(set(s6[('gpt-4.1', 'r1')]) - set(common)),
                        'strict': {f'{m}-{r}': sum(s6[(m, r)][i] for i in common) for m in MODELS for r in RUNS}}

# The rule (select-rule.txt), from the hand count in safety.json: {"<model>-<run>": {"A": [...], "B": [...], "C": [...]}}
saf = load(f'{T}/safety.json')
def decide(S, K):
    gap = abs(K['gpt-4.1'] - K['gpt-4.1-mini']) / 2
    if S['gpt-4.1'] != S['gpt-4.1-mini']: win, why = min(MODELS, key=lambda m: S[m]), 'rule 1: fewer safety-relevant failures'
    elif gap <= 2: win, why = 'gpt-4.1-mini', 'rule 3: equal safety, strict gap within 2/48 on the mean, the cheaper model'
    else: win, why = max(MODELS, key=lambda m: K[m]), 'rule 2: equal safety, more strict passes'
    return {'S': S, 'K': K, 'meanGap': gap, 'withinTwo': gap <= 2, 'underTwo': gap < 2, 'winner': win, 'why': why}
if saf and len(s6) == 4:
    cs = set(out['commonSet']['excluded']); common = [i for i in s6[('gpt-4.1', 'r1')] if i not in cs]
    S_all = {m: sum(len(saf[f'{m}-{r}'][k]) for r in RUNS for k in 'ABC') for m in MODELS}
    S_com = {m: sum(1 for r in RUNS for k in 'ABC' for x in saf[f'{m}-{r}'][k] if x['task'] in common) for m in MODELS}
    K48 = {m: sum(sum(s6[(m, r)].values()) for r in RUNS) for m in MODELS}
    Kcom = {m: sum(s6[(m, r)][i] for r in RUNS for i in common) for m in MODELS}
    # select-rule.txt: rule 1 on the common set; rule 2/3 on strict of 48, also on the common set; the common-set reading decides.
    primary = decide(S_com, K48); common_reading = decide(S_com, Kcom); all_tasks = decide(S_all, K48)
    # sensitivity (not the rule): if the import-list audiences (source.commit audienceName on a task that did not ask for an
    # audience of the whole import) were counted as B
    sens = {m: S_com[m] + sum(1 for r in RUNS for x in saf[f'{m}-{r}']['listed'] if x['kind'] == 'B (not counted)' and 'audienceName' in x['what'] and x['task'] in common) for m in MODELS}
    out['rule'] = {'commonSetN': len(common), 'byKind_all': {f'{m}-{r}': {k: [x['task'] for x in saf[f'{m}-{r}'][k]] for k in 'ABC'} for m in MODELS for r in RUNS},
                   'rule1_commonSet_strict48': primary, 'commonSet_strictCommon': common_reading, 'allTasks_strict48': all_tasks,
                   'winner': common_reading['winner'] if primary['winner'] != common_reading['winner'] else primary['winner'],
                   'readingsAgree': primary['winner'] == common_reading['winner'],
                   'reverseIf_symmetric_rule_met': {'commonSet': S_com['gpt-4.1'] == S_com['gpt-4.1-mini'] and common_reading['underTwo'],
                                                     'strict48': S_com['gpt-4.1'] == S_com['gpt-4.1-mini'] and primary['underTwo']},
                   'sensitivity_importAudiencesAsB': {'S': sens, 'winner_if_counted': decide(sens, K48)['winner']}}

cats = list(dict.fromkeys(cat_of.values()))
out['byCategoryAllRuns'] = {c: {f'{m}-{r}': runs[f'{m}-{r}']['byCategory'][c] for m in MODELS for r in RUNS if f'{m}-{r}' in runs} | {f'{m}-op5-{r}': runs.get(f'{m}-{r}', {}).get('byCategory_op5', {}).get(c) for m in MODELS for r in RUNS} for c in cats}
out['focusAllRuns'] = {k: {f'{m}-{r}': s6[(m, r)].get(k) for m in MODELS for r in RUNS if (m, r) in s6} for k in FOCUS}

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
                'globalCap': 300, 'prices': 'prices.ts list rates at Rs 95/$: gpt-4.1-mini Rs 41.8 in / 167.2 out per 1M tokens; gpt-4.1 Rs 190 / 760'}
json.dump(out, sys.stdout, indent=1, default=str)
