# g2-gemini-live-measured: paid-list-price cost per call and per connected minute from MEASURED usageMetadata, plus a
# fitted per-invocation model to project other call lengths, compression triggers and persona sizes (computed, labelled).
# Inputs: results/token_growth.csv, results/calls_cost.csv (from analyze.py). Outputs: results/cost_by_length.csv,
# results/cost_projection.csv, results/cost_fit_params.csv, results/ai_budget.csv
import csv, os, json, statistics
RES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'results')
FX = 95.0
P = {  # USD per 1M (g1 prices.json, Gemini API standard paid tier)
    'gemini-3.1-flash-live-preview': {'ti': 0.75, 'ai': 3.0, 'to': 4.5, 'ao': 12.0},
    'gemini-3.8-live': {'ti': 0.75, 'ai': 3.0, 'to': 4.5, 'ao': 12.0},
    'gemini-2.5-flash-native-audio-latest': {'ti': 0.50, 'ai': 3.0, 'to': 2.0, 'ao': 12.0},
}
def rd(n): return list(csv.DictReader(open(os.path.join(RES, n))))
def f(x): return float(x) if x not in ('', None) else 0.0
calls = rd('calls_cost.csv'); growth = rd('token_growth.csv')
cal = json.load(open(os.path.join(RES, 'transcript_token_calibration.json')))
TPC = cal['tokens_per_char']

# ---------------------------------------------------------------- 1. measured, by call length
out = []
for c in sorted(calls, key=lambda r: (r['vantage'], r['model'], r['compression'], f(r['minutes_target']))):
    if not c['tag'].startswith('us_') and not c['tag'].startswith('in_'): continue
    out.append({k: c[k] for k in ('tag', 'vantage', 'model', 'compression', 'vad', 'script', 'flags', 'minutes_target', 'call_min', 'turns', 'invocations',
                                   'final_prompt_tok', 'inr_usage', 'inr_per_min_usage', 'inr_tx_est', 'inr_per_min_incl_tx')} |
               {'usd_per_min_usage': round(f(c['usd_usage']) / f(c['call_min']), 5)})
# sensitivity for 2.5 native audio: usageMetadata labels the retained history TEXT; if Google bills it as audio input
# instead, what would the call cost? (computed; not knowable from the free tier)
S0_25 = {}
for g in growth:
    if g['model'] == 'gemini-2.5-flash-native-audio-latest' and g['invocation'] == '0': S0_25[g['tag']] = f(g['prompt_text'])
alt = {}
for g in growth:
    if g['model'] != 'gemini-2.5-flash-native-audio-latest': continue
    s0 = S0_25.get(g['tag'], 1207.0); pr = P[g['model']]
    usd = (min(f(g['prompt_text']), s0) * pr['ti'] + max(0.0, f(g['prompt_text']) - s0) * pr['ai'] + f(g['prompt_audio']) * pr['ai'] + f(g['resp_audio']) * pr['ao']) / 1e6
    alt[g['tag']] = alt.get(g['tag'], 0.0) + usd
for r in out:
    r['inr_per_min_if_history_billed_as_audio'] = round(alt[r['tag']] * FX / f(r['call_min']), 3) if r['tag'] in alt else ''
with open(os.path.join(RES, 'cost_by_length.csv'), 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(out[0].keys())); w.writeheader(); [w.writerow(r) for r in out]

# ---------------------------------------------------------------- 2. fit per-invocation parameters (uncompressed calls)
params = {}
for m in P:
    import re as _re  # fit only on the sandbox cost matrix (P1, meera VAD, default config): us_gXX_<n>m_off
    offs = [c for c in calls if c['model'] == m and _re.fullmatch(r'us_g\d\d_\d+m_off', c['tag'])]
    if not offs: continue
    tags = {c['tag'] for c in offs}
    G = [g for g in growth if g['tag'] in tags]
    # invocation rate per connected minute, pooled
    inv_rate = sum(f(c['invocations']) for c in offs) / sum(f(c['call_min']) for c in offs)
    S0 = statistics.median([f(g['prompt_text']) for g in G if g['invocation'] == '0'])
    A0 = statistics.median([f(g['prompt_audio']) for g in G if g['invocation'] == '0'])
    # history growth per connected minute (slope of prompt vs t), pooled over calls >= 3 min
    def slope(key):
        num = den = 0.0
        for t in tags:
            gs = [g for g in G if g['tag'] == t]
            if len(gs) < 6: continue
            xs = [f(g['t_s']) / 60 for g in gs]; ys = [f(g[key]) for g in gs]
            mx, my = statistics.mean(xs), statistics.mean(ys)
            num += sum((x - mx) * (y - my) for x, y in zip(xs, ys)); den += sum((x - mx) ** 2 for x in xs)
        return num / den if den else 0.0
    gt, ga = slope('prompt_text'), slope('prompt_audio')
    ro = statistics.mean([f(g['resp_audio']) for g in G]); th = statistics.mean([f(g['thoughts']) for g in G])
    txchars_per_min = sum(f(c['tx_chars']) for c in offs) / sum(f(c['call_min']) for c in offs)
    params[m] = {'model': m, 'n_calls': len(offs), 'n_invocations': len(G), 'invocations_per_min': round(inv_rate, 3), 'S0_text_tok': S0, 'A0_audio_tok': A0,
                 'text_growth_tok_per_min': round(gt, 1), 'audio_growth_tok_per_min': round(ga, 1), 'resp_audio_tok_per_inv': round(ro, 1),
                 'thought_tok_per_inv': round(th, 1), 'transcript_chars_per_min': round(txchars_per_min, 1)}
with open(os.path.join(RES, 'cost_fit_params.csv'), 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(next(iter(params.values())).keys())); w.writeheader(); [w.writerow(r) for r in params.values()]

def project(m, minutes, trigger=None, target=None, S=None, tx=True):
    """Computed: invocations at the fitted rate; each re-bills S + A0 + history(t); history grows at the fitted per-minute
    text/audio slopes; sliding window: when prompt > trigger, history is cut so prompt == target (system kept)."""
    p = params[m]; pr = P[m]
    S = p['S0_text_tok'] if S is None else S
    n = max(1, round(p['invocations_per_min'] * minutes))
    ht = ha = 0.0; usd = 0.0; last_t = 0.0
    for k in range(n):
        t = (k + 0.5) / p['invocations_per_min']
        dt = t - last_t; last_t = t
        ht += p['text_growth_tok_per_min'] * dt; ha += p['audio_growth_tok_per_min'] * dt
        prompt = S + p['A0_audio_tok'] + ht + ha
        if trigger and prompt > trigger:
            keep = max(0.0, target - S - p['A0_audio_tok']); tot = ht + ha
            if tot > 0: ht, ha = ht * keep / tot, ha * keep / tot
        usd += ((S + ht) * pr['ti'] + (p['A0_audio_tok'] + ha) * pr['ai'] + p['resp_audio_tok_per_inv'] * pr['ao'] + p['thought_tok_per_inv'] * pr['to']) / 1e6
    if tx: usd += p['transcript_chars_per_min'] * minutes * TPC * pr['to'] / 1e6
    return usd

proj = []
for m in params:
    for S_label, S in [('measured persona (~0.9-1.2k tok)', None), ('4k-token persona', 4000), ('Meera-size persona (13k tok)', 13000)]:
        for comp_label, trig, targ in [('off', None, None), ('sliding window trigger S+4k / target S+2k', 'S4', 'S2'), ('trigger S+2k / target S+1k', 'S2', 'S1')]:
            for mins in [1, 3, 5, 10, 15]:
                Sv = S if S is not None else params[m]['S0_text_tok']
                base = Sv + params[m]['A0_audio_tok']
                tr = {None: None, 'S4': base + 4000, 'S2': base + 2000}[trig]
                tg = {None: None, 'S2': base + 2000, 'S1': base + 1000}[targ]
                usd = project(m, mins, tr, tg, S)
                proj.append({'model': m, 'persona': S_label, 'compression': comp_label, 'call_min': mins, 'usd_per_call': round(usd, 5), 'inr_per_call': round(usd * FX, 3),
                             'inr_per_min': round(usd * FX / mins, 3), 'method': 'computed from fitted per-invocation parameters (cost_fit_params.csv)'})
# validation rows: projection vs measured, same lengths, uncompressed, measured persona
for c in calls:
    if __import__('re').fullmatch(r'us_g\d\d_\d+m_off', c['tag']) and c['model'] in params:
        usd = project(c['model'], f(c['call_min']))
        proj.append({'model': c['model'], 'persona': 'VALIDATION vs ' + c['tag'], 'compression': 'off', 'call_min': c['call_min'], 'usd_per_call': round(usd, 5),
                     'inr_per_call': round(usd * FX, 3), 'inr_per_min': round(usd * FX / f(c['call_min']), 3), 'method': f"measured {c['inr_per_min_incl_tx']} INR/min"})
with open(os.path.join(RES, 'cost_projection.csv'), 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(proj[0].keys())); w.writeheader(); [w.writerow(r) for r in proj]

# ---------------------------------------------------------------- 3. the AI budget implied by a ~INR 2 price (brief section 1)
bud = []
for gst in ['price includes 18% GST', 'GST charged on top']:
    net = 2.0 / 1.18 if gst.startswith('price includes') else 2.0
    for tel in [0.38, 0.48]:
        for margin in [0.4, 0.5, 0.6]:
            ai = net * (1 - margin) - tel
            bud.append({'gst': gst, 'net_revenue_inr_per_min': round(net, 3), 'telephony_inr_per_min': tel, 'gross_margin': margin,
                        'allowed_ai_cost_inr_per_min': round(ai, 3), 'method': 'computed: net*(1-margin) - telephony; platform/hosting overhead not included'})
with open(os.path.join(RES, 'ai_budget.csv'), 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(bud[0].keys())); w.writeheader(); [w.writerow(r) for r in bud]
print(json.dumps(params, indent=1))
for r in proj:
    if r['persona'].startswith('measured') or r['persona'].startswith('VALID'):
        print(r['model'][:12], r['persona'][:30], r['compression'][:22], r['call_min'], r['inr_per_min'], r['method'][:40])
