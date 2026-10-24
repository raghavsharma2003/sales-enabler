# Stage 8 config fix (2026-10-24): independent spend check. Reads Azure Monitor's own counters for the lab's AI Services
# account (vp-lab-ai-sin, vp-research-rg; read-only, through lab_ops.arm, which refuses any path outside vp-research-rg):
# ModelRequests, InputTokens and OutputTokens per ModelDeploymentName over a UTC window, in 1-minute grains, and prices
# them at op7's rates (INR per 1M tokens: lab-gpt41mini-in 41.8 in / 167.2 out, lab-gpt41 190 / 760). This covers every
# request to those deployments, from any caller (control plane, runtime, background jobs), which the product's DB does
# not meter for every purpose. Azure's metrics lag a few minutes. Nothing secret is printed.
#   python3 azmetrics9.py START END      (ISO UTC, e.g. 2026-10-24T10:10:00Z 2026-10-24T11:00:00Z)
import sys, json, urllib.parse
sys.path.insert(0, '/home/user/sales-enabler/voicelab/ops')
import lab_ops as L
PRICE = {'lab-gpt41mini-in': (41.8, 167.2), 'lab-gpt41': (190.0, 760.0)}
start, end = sys.argv[1], sys.argv[2]
acct = f'{L.CS}/{L.AI_ACCT}'
q = urllib.parse.urlencode({'api-version': '2018-01-01', 'metricnames': 'ModelRequests,InputTokens,OutputTokens', 'timespan': f'{start}/{end}',
                            'interval': 'PT1M', 'aggregation': 'Total', '$filter': "ModelDeploymentName eq '*'"})
s, d = L.arm('GET', f'{acct}/providers/Microsoft.Insights/metrics?{q}')
if s != 200: raise SystemExit(f'metrics {s}: {json.dumps(d)[:300]}')
tot = {}
for m in d.get('value', []):
    name = m['name']['value']
    for ts in m.get('timeseries', []):
        dep = next((x['value'] for x in ts.get('metadatavalues', []) if x['name']['value'].lower() == 'modeldeploymentname'), '?')
        v = sum(p.get('total') or 0 for p in ts.get('data', []))
        mins = [p['timeStamp'][11:16] for p in ts.get('data', []) if p.get('total')]
        t = tot.setdefault(dep, {}); t[name] = t.get(name, 0) + v
        if mins: t.setdefault('minutes', set()).update(mins)
inr = 0.0
for dep, t in sorted(tot.items()):
    pin, pout = PRICE.get(dep, (None, None))
    cost = (t.get('InputTokens', 0) * pin + t.get('OutputTokens', 0) * pout) / 1e6 if pin is not None else None
    if cost: inr += cost
    mins = sorted(t.get('minutes', []))
    print(f"{dep}: requests {int(t.get('ModelRequests', 0))}, input tokens {int(t.get('InputTokens', 0))}, output tokens {int(t.get('OutputTokens', 0))}, "
          f"INR {'%.2f' % cost if cost is not None else '(no op7 price)'}" + (f"; active minutes {mins[0]}-{mins[-1]} UTC ({len(mins)})" if mins else ''))
print(f'window {start} to {end}: priced total INR {inr:.2f}')
