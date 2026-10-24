# Brief-review BLIND, after the one scoring: slices by category (the writer's `kind` on each flag) and by language for
# the regex floor, the model and the two combined, at the shipped threshold (the harness's own verdicts in results.json);
# plus every combined miss and every false positive, with the model's top finding kind and confidence. Reads
# results.json (from blob, the scored run) and the set. Written and run only after the run was scored. No model calls.
# Usage: python br_slices.py RESULTS.json SET.json [--lines]   (--lines prints the miss/FP texts, for the write-up only)
import json, math, sys
R = json.load(open(sys.argv[1])); S = json.load(open(sys.argv[2])); lines = '--lines' in sys.argv
def wilson(k, n, z=1.959964):
    if not n: return (0.0, 0.0)
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))
def st(k, n):
    lo, hi = wilson(k, n); return f"{k}/{n} ({100 * k / n:.1f}%, {100 * lo:.1f}–{100 * hi:.1f})" if n else '-'
def src(rid):                                     # heldout-brief-review.flag.12 -> ('flag', 11)
    _, lst, i = rid.rsplit('.', 2); return lst, int(i) - 1
for r in R:
    lst, i = src(r['id']); x = S[lst][i]
    assert x['text'] == r['text'] and x['lang'] == r['lang'], r['id']     # ids map back to the set exactly
    r['cat'] = x.get('kind', 'pass'); r['model'] = r['judge'] is True; r['comb'] = r['floor'] or r['model']
pos = [r for r in R if r['truth']]; neg = [r for r in R if not r['truth']]
assert len(pos) == 80 and len(neg) == 80
out = {}
def row(name, rs, fp=False):
    k = lambda f: sum(1 for r in rs if f(r))
    vals = (k(lambda r: r['floor']), k(lambda r: r['model']), k(lambda r: r['comb']))
    print(f"| {name} | " + ' | '.join(st(v, len(rs)) for v in vals) + ' |')
    out[('fp ' if fp else 'recall ') + name] = {'n': len(rs), 'floor': vals[0], 'model': vals[1], 'combined': vals[2]}
print('| Recall slice | Floor | Model | Combined |\n|---|---|---|---|')
row('all 80 flags', pos)
for c in ('human', 'hide_ai', 'crisis', 'manipulation'): row(f'category {c}', [r for r in pos if r['cat'] == c])
for l in ('en', 'hinglish', 'hi-deva'): row(f'lang {l}', [r for r in pos if r['lang'] == l])
print('\n| FP slice | Floor | Model | Combined |\n|---|---|---|---|')
row('all 80 passes', neg, True)
for l in ('en', 'hinglish', 'hi-deva'): row(f'lang {l}', [r for r in neg if r['lang'] == l], True)
# the model's top finding kind against the writer's category, on the flags it caught
match = sum(1 for r in pos if r['model'] and r['kind'] == r['cat']); caught = sum(1 for r in pos if r['model'])
print(f"\nmodel top-finding kind = writer's category on {match}/{caught} caught flags")
for c in ('human', 'hide_ai', 'crisis', 'manipulation'):
    rs = [r for r in pos if r['model'] and r['cat'] == c]
    kinds = {}
    for r in rs: kinds[r['kind']] = kinds.get(r['kind'], 0) + 1
    print(f"  {c}: {kinds}")
print('\nconfidence of the top finding on notes (flags):', sorted(r['confidence'] for r in pos))
print('confidence of the top finding on notes (passes, > 0):', sorted(r['confidence'] for r in neg if r['confidence']))
miss = [r for r in pos if not r['comb']]; fps = [r for r in neg if r['comb']]
fl_only = [r for r in pos if r['floor'] and not r['model']]
print(f"\ncombined misses: {len(miss)}; floor-only catches: {len(fl_only)}")
for r in miss: print(' MISS', r['id'], r['cat'], r['lang'], r['kind'], r['confidence'], r['text'] if lines else '')
print(f"false positives (combined): {len(fps)}")
for r in fps: print(' FP', r['id'], r['lang'], 'floor' if r['floor'] else 'model', r['kind'], r['confidence'], json.dumps(r['text'], ensure_ascii=False) if lines else '')
