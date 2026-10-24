#!/usr/bin/env python3
# op6 (new, no model calls; run AFTER both blind scores): joins each blind run's results.json to the set's own labels by
# row id (heldout-brief-review.flag.N = set.flag[N-1], .pass.N = set.pass[N-1]) and reports, at the shipped threshold
# (the report's own judge verdict, threshold 0.5 from brief-review.json):
#   - recall on the flag rows for the regex floor, the model and the two combined, overall, by category (the set's
#     'kind': human, hide_ai, crisis, manipulation) and by language (en, hinglish, hi-deva);
#   - false positives on the pass rows for the same three;
#   - the floor on all 160 rows (the floor is the regex door; it does not depend on the model: checked equal on the rows
#     both runs judged);
#   - every combined miss and every model or floor false positive, with the line (the set is synthetic) for the README.
# Usage: brief-analysis.py <out.json>
import json, math, sys
WT = '/dev/shm/wt-op6'
S = json.load(open(f'{WT}/product/shared/safety/sets/heldout-brief-review.json'))
RUNS = {'gpt-4.1': '/dev/shm/bench-out-op6/brief-blind-gpt41-review-blind', 'gpt-4.1-mini': '/dev/shm/bench-out-op6/brief-blind-mini-review-blind'}

def wilson(k, n, z=1.959964):
    if not n: return [0.0, 0.0]
    p = k / n; d = 1 + z * z / n; c = p + z * z / (2 * n); m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return [round(max(0.0, (c - m) / d), 4), round(min(1.0, (c + m) / d), 4)]
st = lambda k, n: {'k': k, 'n': n, 'rate': round(k / n, 4) if n else None, 'ci95': wilson(k, n), 'txt': f"{k}/{n}" + (f" ({100*k/n:.1f}%, CI {100*wilson(k,n)[0]:.1f}-{100*wilson(k,n)[1]:.1f})" if n else '')}

def row_of(rid):
    _, kind, i = rid.rsplit('.', 2)
    x = (S['flag'] if kind == 'flag' else S['pass'])[int(i) - 1]
    return kind, int(i), x

def slices(rs):
    pos = [r for r in rs if r['truth']]; neg = [r for r in rs if not r['truth']]
    J = lambda r: r['judge'] is True
    return {'recall': {'floor': st(sum(r['floor'] for r in pos), len(pos)), 'model': st(sum(J(r) for r in pos), len(pos)),
                       'combined': st(sum(r['floor'] or J(r) for r in pos), len(pos))},
            'fp': {'floor': st(sum(r['floor'] for r in neg), len(neg)), 'model': st(sum(J(r) for r in neg), len(neg)),
                   'combined': st(sum(r['floor'] or J(r) for r in neg), len(neg))}}

out = {}
floors = {}
for m, d in RUNS.items():
    res = json.load(open(f'{d}/results.json')); rep = json.load(open(f'{d}/report.json'))
    for r in res:
        kind, i, x = row_of(r['id']); r['cat'] = x.get('kind') if kind == 'flag' else 'pass'; r['set_lang'] = x.get('lang'); r['line'] = x['text']
        assert r['lang'] == x.get('lang') and bool(r['truth']) == (kind == 'flag')
        floors.setdefault(r['id'], set()).add(bool(r['floor']))
    pos = [r for r in res if r['truth']]
    o = {'judged': rep['n'], 'stopped_early': rep['stopped_early'], 'threshold': rep['threshold'], 'timeout_ms': rep['timeout_ms'],
         'unavailable': rep['judge_unavailable'], 'unavailable_reasons': rep['unavailable_reasons'],
         'latency_ms': rep['latency_ms'], 'tokens_per_turn': rep['tokens_per_turn'], 'cost_inr': rep['cost_inr'],
         'overall': slices(res),
         'byCategory': {c: slices([r for r in pos if r['cat'] == c])['recall'] for c in ('human', 'hide_ai', 'crisis', 'manipulation')},
         'byLang': {l: slices([r for r in res if r['set_lang'] == l]) for l in ('en', 'hinglish', 'hi-deva')},
         'sweep_exploratory': rep['tasks']['brief_review']['sweep'],
         'judgedIds': {'flag': sorted(int(r['id'].rsplit('.', 1)[1]) for r in res if r['truth']), 'pass': sorted(int(r['id'].rsplit('.', 1)[1]) for r in res if not r['truth'])},
         'combinedMisses': [{'id': r['id'], 'cat': r['cat'], 'lang': r['set_lang'], 'conf': r['confidence'], 'kindSaid': r['kind'], 'failed': r['failed'], 'line': r['line']} for r in res if r['truth'] and not r['floor'] and r['judge'] is not True],
         'modelFP': [{'id': r['id'], 'lang': r['set_lang'], 'conf': r['confidence'], 'kindSaid': r['kind'], 'line': r['line']} for r in res if not r['truth'] and r['judge'] is True],
         'floorFP': [{'id': r['id'], 'lang': r['set_lang'], 'line': r['line']} for r in res if not r['truth'] and r['floor']],
         'unavailableRows': [{'id': r['id'], 'reason': r['failed'], 'truth': r['truth'], 'floor': r['floor']} for r in res if r['failed']]}
    out[m] = o
out['floorConsistentAcrossRuns'] = all(len(v) == 1 for v in floors.values())
# The floor on all 160 rows, from the run that judged every row
full = json.load(open(f"{RUNS['gpt-4.1-mini']}/results.json"))
for r in full:
    kind, i, x = row_of(r['id']); r['cat'] = x.get('kind') if kind == 'flag' else 'pass'; r['set_lang'] = x.get('lang')
pos = [r for r in full if r['truth']]
out['floorAll160'] = {'recall': st(sum(r['floor'] for r in pos), len(pos)), 'fp': st(sum(r['floor'] for r in full if not r['truth']), 80),
                      'byCategory': {c: st(sum(r['floor'] for r in pos if r['cat'] == c), sum(1 for r in pos if r['cat'] == c)) for c in ('human', 'hide_ai', 'crisis', 'manipulation')},
                      'byLang': {l: st(sum(r['floor'] for r in pos if r['set_lang'] == l), sum(1 for r in pos if r['set_lang'] == l)) for l in ('en', 'hinglish', 'hi-deva')}}
# mini restricted to the rows gpt-4.1 judged (a like-for-like comparison) and the paired McNemar on those rows
g = {r['id']: r for r in json.load(open(f"{RUNS['gpt-4.1']}/results.json"))}
mm = [r for r in full if r['id'] in g]
out['mini_onGpt41Rows'] = slices(mm)
def mcn(a, b):
    n = len(a) + len(b); k = min(len(a), len(b))
    return {'gpt41Only': a, 'miniOnly': b, 'p': round(1.0 if n == 0 else min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n), 4)}
J = lambda r: r['judge'] is True
out['paired_onGpt41Rows'] = {
  'flags_combined': mcn([i for i in g if g[i]['truth'] and (g[i]['floor'] or J(g[i])) and not next(r for r in mm if r['id'] == i)['judge'] is True and not g[i]['floor']], []) if False else None,
}
fl = [i for i in g if g[i]['truth']]; pa = [i for i in g if not g[i]['truth']]
fm = {r['id']: r for r in mm}
out['paired_onGpt41Rows'] = {
  'recall_model': mcn([i for i in fl if J(g[i]) and not J(fm[i])], [i for i in fl if J(fm[i]) and not J(g[i])]),
  'recall_combined': mcn([i for i in fl if (g[i]['floor'] or J(g[i])) and not (fm[i]['floor'] or J(fm[i]))], [i for i in fl if (fm[i]['floor'] or J(fm[i])) and not (g[i]['floor'] or J(g[i]))]),
  'fp_model': mcn([i for i in pa if J(g[i]) and not J(fm[i])], [i for i in pa if J(fm[i]) and not J(g[i])]),
}
json.dump(out, open(sys.argv[1], 'w'), indent=1, ensure_ascii=False)
for m in RUNS:
    o = out[m]
    print(m, o['judged'], o['stopped_early'], 'recall floor', o['overall']['recall']['floor']['txt'], 'model', o['overall']['recall']['model']['txt'], 'combined', o['overall']['recall']['combined']['txt'],
          '| FP floor', o['overall']['fp']['floor']['txt'], 'model', o['overall']['fp']['model']['txt'], 'combined', o['overall']['fp']['combined']['txt'])
    print('   by cat', {c: v['combined']['txt'] for c, v in o['byCategory'].items()}, '| model', {c: v['model']['txt'] for c, v in o['byCategory'].items()}, '| floor', {c: v['floor']['txt'] for c, v in o['byCategory'].items()})
    print('   by lang recall comb', {l: v['recall']['combined']['txt'] for l, v in o['byLang'].items()}, 'model', {l: v['recall']['model']['txt'] for l, v in o['byLang'].items()}, 'fp model', {l: v['fp']['model']['txt'] for l, v in o['byLang'].items()})
    print('   misses', len(o['combinedMisses']), 'modelFP', len(o['modelFP']), 'floorFP', len(o['floorFP']), 'unavail', o['unavailableRows'], o['latency_ms'], o['cost_inr']['spent'])
print('floor all 160', out['floorAll160']['recall']['txt'], out['floorAll160']['fp']['txt'], {c: v['txt'] for c, v in out['floorAll160']['byCategory'].items()}, {l: v['txt'] for l, v in out['floorAll160']['byLang'].items()}, 'consistent', out['floorConsistentAcrossRuns'])
print('mini on gpt-4.1 rows', {k: {kk: vv['txt'] for kk, vv in v.items()} for k, v in out['mini_onGpt41Rows'].items()})
print('paired', json.dumps(out['paired_onGpt41Rows']))
