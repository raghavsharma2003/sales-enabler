# g5-gemini-paid: write the run plans.
#  plan_cost.json     sandbox, PAID only, script P1 (same as g2's free-key cost runs, so metering can be compared):
#                     4 streams (g31/g38 x compression off / on:6000:3000), each 3, 10, 1, 5 min + replicate 3 and 10 min
#  plan_latency.json  one plan per vantage ('us' sandbox, 'in' Central India VM): 6 rounds x 2 models x {paid, free},
#                     2-minute calls, identical script + seed within a round; tier order alternates ABBA by round and
#                     model order alternates by round, so paid and free are interleaved in time
#  plan_samples.json  India VM, PAID: worried caller (W) and elderly pause probe (PAUSE), 3 min, audio saved
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
M = {'g31': 'gemini-3.1-flash-live-preview', 'g38': 'gemini-3.8-live'}
EXP = {1: 0.06, 3: 0.25, 5: 0.5, 10: 1.6}
cost = {}
for m in ('g31', 'g38'):
    for comp, cn in (('off', 'off'), ('on:6000:3000', 'on6k')):
        s = []
        for mins, seed in ((3, 3), (10, 10), (1, 1), (5, 5), (3, 13), (10, 20)):  # plus cx31/cx38 (tight compression on:2500:1500, 10 min) added by hand at 19:10 UTC
            rep = 'b' if seed in (13, 20) else 'a'
            s.append({'tag': f'cost_{m}_{mins}m_{cn}_{rep}', 'model': M[m], 'tier': 'paid', 'minutes': mins, 'script': 'P1',
                      'compression': comp, 'vad': 'meera', 'seed': seed, 'expect_usd': EXP[mins], 'cap_usd': 2.5})
        cost[f'c{m[1:]}{cn}'] = s
json.dump(cost, open(os.path.join(HERE, 'plan_cost.json'), 'w'), indent=1)

PERS = ['P1', 'P4', 'P2', 'P3', 'P1', 'P4']
lat = {}
for v in ('us', 'in'):
    s = []
    for r, p in enumerate(PERS):
        models = ['g31', 'g38'] if r % 2 == 0 else ['g38', 'g31']
        for j, m in enumerate(models):
            tiers = ['paid', 'free'] if (r + j) % 2 == 0 else ['free', 'paid']
            for t in tiers:
                s.append({'tag': f'lat_{v}_{m}_{t}_r{r}', 'model': M[m], 'tier': t, 'minutes': 2, 'script': p,
                          'compression': 'off', 'vad': 'meera', 'seed': 100 + r, 'expect_usd': 0.12, 'cap_usd': 0.6})
    lat[v] = s
json.dump(lat, open(os.path.join(HERE, 'plan_latency.json'), 'w'), indent=1)

samples = {'in': []}
for m in ('g31', 'g38'):
    for sc, nm in (('W', 'worried'), ('PAUSE', 'elderly')):
        samples['in'].append({'tag': f'sample_in_{m}_{nm}', 'model': M[m], 'tier': 'paid', 'minutes': 3, 'script': sc,
                              'compression': 'off', 'vad': 'meera', 'seed': 7, 'expect_usd': 0.3, 'cap_usd': 1.0, 'save_audio': True})
json.dump(samples, open(os.path.join(HERE, 'plan_samples.json'), 'w'), indent=1)
print('cost', sum(len(v) for v in cost.values()), 'latency', {k: len(v) for k, v in lat.items()}, 'samples', len(samples['in']))
print('paid expected USD: cost', round(sum(c['expect_usd'] for v in cost.values() for c in v), 2),
      'latency', round(sum(c['expect_usd'] for v in lat.values() for c in v if c['tier'] == 'paid'), 2),
      'samples', round(sum(c['expect_usd'] for c in samples['in']), 2))
