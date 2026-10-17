#!/usr/bin/env python3
"""Aggregate measurements.csv into the tables used in report.md.

python3 analyze.py  -> ../data/summary-by-vendor.csv, ../data/summary-by-vendor-persona.csv, prints markdown tables
Latency statistics use only 'clean' turns (agent silent while the caller spoke, reply >= 250 ms after the caller
stopped); collisions and no-replies are counted separately. Bootstrap 90% CI on the median, 2,000 resamples, seed 7.
"""
import csv, json, os, random
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
CALLER_LANG = {'P1': 'hi-IN', 'P2': 'hi-IN', 'P3': 'ta-IN', 'P4': 'hi-IN'}


def boot_ci(v, q=50, n=2000, seed=7):
    if len(v) < 3:
        return ('', '')
    rng = np.random.default_rng(seed)
    a = np.array(v)
    m = [np.percentile(rng.choice(a, len(a)), q) for _ in range(n)]
    return (round(float(np.percentile(m, 5))), round(float(np.percentile(m, 95))))


def dom_lang(s):
    if not s:
        return ''
    best = max(s.split('+'), key=lambda x: int(x.split(':')[1]))
    return best.split(':')[0]


def summarize(R):
    clean = [r for r in R if r['outcome'] == 'clean' and r['type'] != 'barge' and r['latency_ms'] not in ('', None)]
    lat = [float(r['latency_ms']) for r in clean]
    turns = [r for r in R if r['type'] not in ('silence',)]
    nonbarge = [r for r in R if r['type'] not in ('silence', 'barge')]
    barge = [r for r in R if r['type'] == 'barge']
    barge_app = [r for r in barge if r['barge_stop_ms'] not in ('', None) or r['barge_overtalk_s'] not in ('', None)]
    words = [float(r['resp_words']) for r in turns if r['resp_words'] not in ('', None) and r['outcome'] != 'no_reply']
    langs = [dom_lang(r['agent_lang']) for r in turns if r['agent_lang']]
    sil = [r for r in R if r['type'] == 'silence']
    lo, hi = boot_ci(lat)
    return {
        'calls': len(set((r['persona'], r['rep']) for r in R)),
        'caller_turns': len(nonbarge),
        'clean_n': len(lat),
        'latency_p50_ms': round(float(np.percentile(lat, 50))) if lat else '',
        'p50_ci90': f'{lo}-{hi}' if lo != '' else '',
        'latency_p90_ms': round(float(np.percentile(lat, 90))) if lat else '',
        'latency_p95_ms': round(float(np.percentile(lat, 95))) if lat else '',
        'latency_min_max_ms': f'{round(min(lat))}-{round(max(lat))}' if lat else '',
        'collision_n': sum(1 for r in nonbarge if r['outcome'] == 'collision'),
        'no_reply_n': sum(1 for r in nonbarge if r['outcome'] == 'no_reply'),
        'barge_applied_n': len(barge_app),
        'barge_handled_n': sum(1 for r in barge_app if r['barge_handled'] == '1'),
        'barge_stop_ms_values': ' '.join(str(r['barge_stop_ms']) for r in barge_app),
        'words_mean': round(float(np.mean(words)), 1) if words else '',
        'words_p50': round(float(np.percentile(words, 50))) if words else '',
        'words_p90': round(float(np.percentile(words, 90))) if words else '',
        'turns_over_40_words': sum(1 for w in words if w > 40),
        'agent_lang_counts': ' '.join(f'{k}:{langs.count(k)}' for k in sorted(set(langs))),
        'silence_turns': len(sil),
        'silence_reprompted': sum(1 for r in sil if r['reprompt_ms'] not in ('', None)),
        'reprompt_ms_values': ' '.join(str(r['reprompt_ms']) for r in sil if r['reprompt_ms'] not in ('', None)),
        'robot_turns': sum(1 for r in R if r['content_check'] == 'robot'),
        'robot_disclosed_auto': sum(1 for r in R if r['disclosure'] == 'disclosed'),
        'content_checks': sum(1 for r in R if r['content_check'] == 'regex' and r['content_pass'] != ''),
        'content_pass': sum(1 for r in R if r['content_check'] == 'regex' and r['content_pass'] == '1'),
    }


def main():
    rows = list(csv.DictReader(open(os.path.join(DATA, 'measurements.csv'))))
    out, outp = [], []
    for v in sorted(set(r['vendor'] for r in rows)):
        R = [r for r in rows if r['vendor'] == v]
        out.append({'vendor': v, **summarize(R)})
        for p in sorted(set(r['persona'] for r in R)):
            outp.append({'vendor': v, 'persona': p, **summarize([r for r in R if r['persona'] == p])})
    for name, data in (('summary-by-vendor.csv', out), ('summary-by-vendor-persona.csv', outp)):
        with open(os.path.join(DATA, name), 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=list(data[0].keys())); w.writeheader(); [w.writerow(x) for x in data]
    keys = ['vendor', 'calls', 'clean_n', 'latency_p50_ms', 'p50_ci90', 'latency_p90_ms', 'latency_p95_ms', 'collision_n', 'no_reply_n', 'barge_applied_n', 'barge_handled_n', 'words_mean', 'words_p90', 'turns_over_40_words', 'agent_lang_counts', 'silence_reprompted', 'robot_disclosed_auto', 'content_pass']
    print('| ' + ' | '.join(keys) + ' |'); print('|' + '---|' * len(keys))
    for x in out:
        x = dict(x); x['silence_reprompted'] = f"{x['silence_reprompted']}/{x['silence_turns']}"; x['robot_disclosed_auto'] = f"{x['robot_disclosed_auto']}/{x['robot_turns']}"; x['content_pass'] = f"{x['content_pass']}/{x['content_checks']}"
        x['barge_handled_n'] = f"{x['barge_handled_n']}/{x['barge_applied_n']}"
        print('| ' + ' | '.join(str(x[k]) for k in keys) + ' |')
    print()
    keys2 = ['vendor', 'persona', 'clean_n', 'latency_p50_ms', 'latency_p90_ms', 'collision_n', 'no_reply_n', 'words_mean', 'agent_lang_counts', 'content_pass']
    print('| ' + ' | '.join(keys2) + ' |'); print('|' + '---|' * len(keys2))
    for x in outp:
        x = dict(x); x['content_pass'] = f"{x['content_pass']}/{x['content_checks']}"
        print('| ' + ' | '.join(str(x[k]) for k in keys2) + ' |')


if __name__ == '__main__':
    main()
