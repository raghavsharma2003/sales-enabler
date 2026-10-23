# Blind-7-only slices from a judge-eval results.json (the harness's by_lang mixes heldout-6's heuristic tags in).
import json, math, sys
def wilson(k, n):
    if not n: return (0, 0)
    z = 1.959964; p = k / n; d = 1 + z*z/n
    c = (p + z*z/(2*n)) / d; h = z*math.sqrt(p*(1-p)/n + z*z/(4*n*n)) / d
    return (max(0, c-h), min(1, c+h))
def f(k, n):
    lo, hi = wilson(k, n); return f"{k}/{n} ({100*k/n:.1f}%, {100*lo:.1f}-{100*hi:.1f})" if n else '-'
def slices(R):
    out = {}
    langs = ['ta-en', 'bn-en', 'mr-en', 'te-en', 'gu-en', 'hinglish', 'hi-deva']
    for name, rs in [('blind 7 overall', R)] + [(l, [r for r in R if r['lang'] == l]) for l in langs]:
        pos = [r for r in rs if r['crisis']]; neg = [r for r in rs if not r['crisis']]
        J = lambda r: r['judge'] is True
        out[name] = dict(
            floor=(sum(r['floor'] for r in pos), len(pos)), judge=(sum(J(r) for r in pos), len(pos)),
            either=(sum(r['floor'] or J(r) for r in pos), len(pos)),
            fp_judge=(sum(J(r) for r in neg), len(neg)), fp_either=(sum(r['floor'] or J(r) for r in neg), len(neg)),
            unavailable=(sum(bool(r['failed']) for r in rs), len(rs)))
    return out
if __name__ == '__main__':
    R = [r for r in json.load(open(sys.argv[1])) if r['source'] == 'heldout-7']
    S = slices(R)
    print('| Blind 7 slice | Recall: floor | Recall: judge | Recall: floor or judge | FP: judge | FP: floor or judge | Unavailable |')
    print('|---|---|---|---|---|---|---|')
    for k, v in S.items():
        print(f"| {k} | {f(*v['floor'])} | {f(*v['judge'])} | {f(*v['either'])} | {f(*v['fp_judge'])} | {f(*v['fp_either'])} | {v['unavailable'][0]}/{v['unavailable'][1]} |")
    lat = sorted(r['latencyMs'] for r in R if not r['failed'])
    q = lambda p: lat[min(len(lat)-1, int(p*len(lat)))]
    print(f"\nBlind 7 answered latency p50 {q(.5)} ms, p95 {q(.95)} ms, max {lat[-1]} ms (n={len(lat)}).")
    miss = [r['id'] for r in R if r['crisis'] and not r['floor'] and r['judge'] is not True]
    fa = [r['id'] for r in R if not r['crisis'] and r['judge'] is True]
    print(f"Blind 7 crisis lines missed by floor and judge: {', '.join(miss) or 'none'}.")
    print(f"Blind 7 benign lines the judge flagged: {', '.join(fa) or 'none'}.")
