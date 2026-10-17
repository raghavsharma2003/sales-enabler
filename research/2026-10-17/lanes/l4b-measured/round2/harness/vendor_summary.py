# vendor_summary.py <measurements.csv>... -> per-vendor and per-vendor-persona tables (round-2 definitions):
# latency on clean turns, call-clustered bootstrap 90% CI (4,000 resamples, seed 7); words/lang only on turns where the
# agent actually spoke (outcome clean or collision and >= 0.4 s of agent speech in the window), so ASR text hallucinated on a silent agent channel is not counted.
import csv, sys, json, numpy as np
from collections import defaultdict, Counter
def dom(s):
    if not s: return ''
    return max(s.split('+'), key=lambda x: int(x.split(':')[1])).split(':')[0]
def ci_call(R):
    calls = defaultdict(list)
    for r in R: calls[(r['persona'], r['rep'])].append(float(r['latency_ms']))
    keys = list(calls)
    if len(keys) < 2: return ('', '')
    rng = np.random.default_rng(7); m = []
    for _ in range(4000):
        pick = rng.choice(len(keys), len(keys)); m.append(np.median(np.concatenate([calls[keys[i]] for i in pick])))
    return (round(float(np.percentile(m, 5))), round(float(np.percentile(m, 95))))
def summ(R):
    clean = [r for r in R if r['outcome'] == 'clean' and r['type'] != 'barge' and r['latency_ms'] not in ('', None)]
    lat = np.array([float(r['latency_ms']) for r in clean]) if clean else np.array([])
    nonbarge = [r for r in R if r['type'] not in ('silence', 'barge')]
    played = [r for r in nonbarge if 'not found' not in (r['notes'] or '')]
    barge = [r for r in R if r['type'] == 'barge' and (r['barge_stop_ms'] not in ('', None) or r['barge_overtalk_s'] not in ('', None))]
    spoke = [r for r in R if r['type'] != 'silence' and r['outcome'] in ('clean', 'collision') and r['resp_words'] not in ('', None) and float(r['resp_words']) > 0 and r['resp_speech_s'] not in ('', None) and float(r['resp_speech_s']) >= 0.4]
    words = [float(r['resp_words']) for r in spoke]
    langs = Counter(dom(r['agent_lang']) for r in spoke if r['agent_lang'])
    short = [r for r in R if r['type'] == 'short']
    return dict(calls=len(set((r['persona'], r['rep']) for r in R)), n_clean=len(lat),
        p50=round(float(np.median(lat))) if len(lat) else '', ci90_call=ci_call(clean) if len(lat) else '',
        p90=round(float(np.percentile(lat, 90))) if len(lat) else '',
        collisions=f"{sum(r['outcome']=='collision' for r in played)}/{len(played)}",
        no_reply=f"{sum(r['outcome']=='no_reply' for r in played)}/{len(played)}",
        not_played=len(nonbarge) - len(played),
        barge_handled=f"{sum(r['barge_handled']=='1' for r in barge)}/{len(barge)}",
        words_median=float(np.median(words)) if words else '', words_gt40=f"{sum(w>40 for w in words)}/{len(words)}",
        lang=dict(langs), short_outcomes=dict(Counter(r['outcome'] for r in short)),
        disclosure=dict(Counter(r['disclosure'] for r in R if r['disclosure'])))
rows = []
for f in sys.argv[1:]: rows += list(csv.DictReader(open(f)))
byv = defaultdict(list)
for r in rows: byv[r['vendor']].append(r)
for v, R in byv.items():
    print('VENDOR', v, json.dumps(summ(R), ensure_ascii=False))
    for p in sorted(set(r['persona'] for r in R)):
        print('   ', p, json.dumps(summ([r for r in R if r['persona'] == p]), ensure_ascii=False))
