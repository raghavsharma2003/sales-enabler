# compare_table.py: one table across round-1 vendors (lane data/measurements.csv, agent floor -55 dBFS) and round-2 vendors
# (round2/data/measurements.csv; Sarvam at -40 dBFS), same round-2 definitions. Writes round2/data/summary-by-vendor-r2.csv.
import csv, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from vendor_summary_lib import summ
L = '/home/user/sales-enabler/research/2026-10-17/lanes/l4b-measured'
rows = [dict(r, round='r1') for r in csv.DictReader(open(L + '/data/measurements.csv'))] + [dict(r, round='r2') for r in csv.DictReader(open(L + '/round2/data/measurements.csv'))]
order = ['Ultravox', 'Vapi', 'ElevenLabs Agents', 'Sarvam', 'Smallest.ai', 'Cartesia', 'Deepgram']
out = []
for v in order:
    R = [r for r in rows if r['vendor'] == v]
    if not R: continue
    s = summ(R); s['vendor'] = v; s['round'] = R[0]['round']
    for p in ['P1', 'P2', 'P3', 'P4']:
        sp = summ([r for r in R if r['persona'] == p]) if any(r['persona'] == p for r in R) else {}
        s[f'{p}_p50'] = sp.get('p50', ''); s[f'{p}_lang'] = json.dumps(sp.get('lang', {})); s[f'{p}_coll'] = sp.get('collisions', '')
    out.append(s)
keys = list(out[0].keys())
with open(L + '/round2/data/summary-by-vendor-r2.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=keys); w.writeheader()
    for s in out: w.writerow({k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list, tuple)) else v) for k, v in s.items()})
print('| | ' + ' | '.join(s['vendor'] for s in out) + ' |'); print('|---' * (len(out) + 1) + '|')
def row(name, f): print(f'| {name} | ' + ' | '.join(str(f(s)) for s in out) + ' |')
row('calls', lambda s: s['calls'])
row('clean-turn p50, ms (90% CI by call), n', lambda s: f"{s['p50']} ({s['ci90_call'][0]}-{s['ci90_call'][1]}), {s['n_clean']}" if s['p50'] != '' else 'n/a')
row('p90, ms', lambda s: s['p90'])
row('collisions / played caller turns', lambda s: s['collisions'])
row('no reply / played caller turns', lambda s: s['no_reply'])
row('barge-in handled / applied', lambda s: s['barge_handled'])
row('words per spoken turn: median; >40 words', lambda s: f"{s['words_median']}; {s['words_gt40']}")
row('agent language, spoken turns', lambda s: ', '.join(f'{k} {v}' for k, v in s['lang'].items()))
for p in ['P1', 'P2', 'P3', 'P4']:
    row(f'{p} p50 ms', lambda s, p=p: s[f'{p}_p50'])
