# Prints BLIND 8's README tables (research/2026-10-24/judge-blind8/README.md layout) from one judge-eval report.json:
# the results row, the per-language slices, the weak spots, the sweep, and the DEV-run row. Aggregates and ids only;
# no line text exists in report.json. No model calls.
# Usage: python tables9.py REPORT.json [results|lang|sweep|dev|all] [run name]
import json, sys
R = json.load(open(sys.argv[1])); what = sys.argv[2] if len(sys.argv) > 2 else 'all'; name = sys.argv[3] if len(sys.argv) > 3 else R['label']
T = R['tasks']['crisis']
def s(x, full=True):
    if not x['n']: return '-'
    k, n, r, (lo, hi) = x['k'], x['n'], 100 * x['rate'], (100 * x['ci95'][0], 100 * x['ci95'][1])
    return f"{k}/{n}, {r:.1f}% ({lo:.1f}–{hi:.1f})" if full else f"{k}/{n} ({r:.1f}%, {lo:.1f}–{hi:.1f})"
o = T['overall']; u = R['judge_unavailable']; lat = R['latency_ms']; c = R['cost_inr']
reasons = ', '.join(f"{v} {k}{'s' if v != 1 else ''}" if k == 'timeout' else f"{v} {k}" for k, v in R['unavailable_reasons'].items())
if what in ('results', 'all'):
    print('| Run | Recall: floor | Recall: judge | Recall: floor or judge | Benign FP: floor | Benign FP: judge | Benign FP: floor or judge | p50 / p95 (answered) | Unavailable | ₹ per 1k turns |')
    print('|---|---|---|---|---|---|---|---|---|---|')
    print(f"| {name} | {s(o['recall']['floor'])} | {s(o['recall']['judge'])} | **{s(o['recall']['floor_or_judge'])}** | {s(o['false_positives']['floor'])} | "
          f"{s(o['false_positives']['judge'])} | **{s(o['false_positives']['floor_or_judge'])}** | {lat['p50']:,} / {lat['p95']:,} ms (max {lat['max']:,}) | "
          f"{u['k']}/{u['n']}{f' ({reasons})' if reasons else ''} | {c['per_1k_turns']:.2f} |")
    print(f"\njudged {R['n']['judged']}/{R['n']['planned']}, stopped early: {R['stopped_early']}, threshold {R['threshold']}, timeout {R['timeout_ms']} ms, "
          f"tokens/turn {R['tokens_per_turn']['input']:.0f} in / {R['tokens_per_turn']['output']:.1f} out, spent INR {c['spent']:.2f}, wall {R['wall_s']} s, prompt {R['prompt']}")
    print(f"misses (crisis lines neither door flagged): {len(R['misses'])}; judge false alarms: {len(R['false_alarms'])}")
if what in ('lang', 'all'):
    print('\n| Slice | Recall: floor | Recall: judge | Recall: floor or judge | FP: floor | FP: judge | FP: floor or judge |')
    print('|---|---|---|---|---|---|---|')
    for lang, v in T['by_lang'].items():
        print(f"| {lang} | {s(v['recall']['floor'], False)} | {s(v['recall']['judge'], False)} | {s(v['recall']['floor_or_judge'], False)} | "
              f"{s(v['false_positives']['floor'], False)} | {s(v['false_positives']['judge'], False)} | {s(v['false_positives']['floor_or_judge'], False)} |")
    rec = sorted(((v['recall']['floor_or_judge']['rate'], lang, v['recall']['floor_or_judge']) for lang, v in T['by_lang'].items() if v['recall']['floor_or_judge']['n']))
    fp = sorted(((-v['false_positives']['floor_or_judge']['rate'], lang, v['false_positives']['floor_or_judge']) for lang, v in T['by_lang'].items() if v['false_positives']['floor_or_judge']['n']))
    print('\nlowest floor-or-judge recall:', '; '.join(f"{l} {x['k']}/{x['n']}" for _, l, x in rec[:3]))
    print('highest floor-or-judge FP:', '; '.join(f"{l} {x['k']}/{x['n']}" for _, l, x in fp[:3]))
    jfp = [(l, v['false_positives']['judge']) for l, v in T['by_lang'].items() if v['false_positives']['judge']['k']]
    print('judge FP by language:', '; '.join(f"{l} {x['k']}/{x['n']}" for l, x in jfp) or 'none')
if what in ('sweep', 'all'):
    print('\n| Threshold | Recall: judge | Recall: floor or judge | FP: judge | FP: floor or judge |')
    print('|---|---|---|---|---|')
    for w in T['sweep']:
        print(f"| {w['threshold']} | {s(w['recall_judge'], False)} | {s(w['recall_floor_or_judge'], False)} | {s(w['fp_judge'], False)} | {s(w['fp_floor_or_judge'], False)} |")
if what in ('dev', 'all'):
    print(f"\n| {name} | {R['sources'][0]}: {T['n']['positive']} crisis / {T['n']['negative']} not | {s(o['recall']['floor'], False)} / {s(o['recall']['judge'], False)} / {s(o['recall']['floor_or_judge'], False)} | "
          f"{s(o['false_positives']['floor'], False)} / {s(o['false_positives']['judge'], False)} / {s(o['false_positives']['floor_or_judge'], False)} | {lat['p50']:,} / {lat['p95']:,} ms | "
          f"{u['k']}/{u['n']}{f' ({reasons})' if reasons else ''} | {c['spent']:.2f} ({c['per_1k_turns']:.2f}) |")
