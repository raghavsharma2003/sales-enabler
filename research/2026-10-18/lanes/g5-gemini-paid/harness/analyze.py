# g5-gemini-paid: analysis. Reads session folders (meta.json, turns.jsonl, usage.jsonl) and TTS jsonl, writes results/*.csv
# and prints the headline tables. Usage: python analyze.py   (paths below)
import csv, glob, json, os, random, statistics, sys
import requests
SP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad'
RAW = f'{SP}/research-raw-1018/g5-gemini-paid'
G2RAW = f'{SP}/research-raw-1018/g2-gemini-live-measured'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'results')
FX = 95.0
SHORT = {'gemini-3.1-flash-live-preview': '3.1-flash-live', 'gemini-3.8-live': '3.8-live'}
PRICE_TX = 4.50  # transcription text, USD per 1M, text output rate (Live 3.x)
os.makedirs(OUT, exist_ok=True)
random.seed(7)

def jl(p):
    return [json.loads(l) for l in open(p)] if os.path.exists(p) else []
def pct(xs, q):
    xs = sorted(xs)
    if not xs: return None
    k = (len(xs) - 1) * q; f = int(k); c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)
def cboot(groups, q, n=2000):
    """call-clustered bootstrap CI of a pooled percentile: resample calls with replacement."""
    groups = [g for g in groups if g]
    if len(groups) < 2: return (None, None)
    est = []
    for _ in range(n):
        s = [x for _ in groups for x in random.choice(groups)]
        est.append(pct(s, q))
    return pct(est, 0.025), pct(est, 0.975)
def f0(x):
    return '' if x is None else (f'{x:.0f}' if isinstance(x, (int, float)) else x)
def wcsv(name, rows, cols):
    with open(os.path.join(OUT, name), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore'); w.writeheader()
        for r in rows: w.writerow(r)

# ------------------------------------------------------------------ sessions
def vantage_of(tag, meta):
    if tag.startswith('lat_in') or tag.startswith('sample_in') or meta.get('host', '').startswith('g5vm'): return 'centralindia-vm'
    return 'sandbox-us-east-proxy'
def load_sessions(roots):
    S = []
    for root in roots:
        for d in sorted(glob.glob(os.path.join(root, '*'))):
            if not os.path.isdir(d) or '__fail' in d: continue
            mp = os.path.join(d, 'meta.json')
            if not os.path.exists(mp) or not os.path.exists(os.path.join(d, 'turns.jsonl')): continue
            m = json.load(open(mp)); a = m['args']
            S.append({'dir': d, 'tag': a['tag'], 'meta': m, 'args': a, 'turns': jl(os.path.join(d, 'turns.jsonl')),
                      'usage': jl(os.path.join(d, 'usage.jsonl')), 'vantage': vantage_of(a['tag'], m),
                      'model': a['model'], 'tier': a.get('tier', 'free'), 'phase': a['tag'].split('_')[0]})
    return S
ROOTS = [f'{RAW}/runs_cost', f'{RAW}/runs_lat_us', f'{RAW}/vm/runs_in', f'{RAW}/smoke']
S = load_sessions(ROOTS)
print('sessions', len(S), {p: sum(1 for s in S if s['phase'] == p) for p in sorted({s['phase'] for s in S})})

# ------------------------------------------------------------------ transcript tokens (countTokens is free of charge)
TXC = f'{RAW}/txcount_cache.json'
txc = json.load(open(TXC)) if os.path.exists(TXC) else {}
def paid_key():
    env = dict(l.strip().split('=', 1) for l in open(f'{SP}/vp-gemini-or.env') if '=' in l and not l.startswith('#'))
    return env['GEMINI_PAID_KEY']
def count_tokens(text):
    if not text.strip(): return 0
    if text in txc: return txc[text]
    r = requests.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:countTokens',
                      json={'contents': [{'parts': [{'text': text}]}]}, headers={'x-goog-api-key': paid_key()}, timeout=60)
    n = r.json().get('totalTokens') if r.status_code == 200 else None
    if n is None: n = int(len(text) / 2.2)  # fallback estimate
    txc[text] = n
    return n

# ------------------------------------------------------------------ per-session cost + token growth
from_usage = lambda um: ({d['modality']: d['tokenCount'] for d in um.get('promptTokensDetails', []) or []},
                         {d['modality']: d['tokenCount'] for d in um.get('responseTokensDetails', []) or []})
sess_rows, growth_rows = [], []
for s in S:
    m = s['meta']; tok = m.get('tokens') or {}
    usd = m.get('metered_usd_paid_list')
    if usd is None:  # free sessions from the g2-derived harness also carry usage; price them at paid list for comparison
        usd = 0.0
        for u in s['usage']:
            pin, pout = from_usage(u)
            usd += (pin.get('TEXT', 0) * 0.75 + pin.get('AUDIO', 0) * 3 + pout.get('AUDIO', 0) * 12 + (u.get('thoughtsTokenCount') or 0) * 4.5) / 1e6
    outtx = ''.join(t.get('outtx', '') for t in s['turns']); intx = ''.join(t.get('intx', '') for t in s['turns'])
    txo = count_tokens(outtx) if s['phase'] in ('cost', 'lat', 'sample', 'paid') else None
    txi = count_tokens(intx) if s['phase'] in ('cost', 'lat', 'sample', 'paid') else None
    usd_tx = ((txo or 0) + (txi or 0)) * PRICE_TX / 1e6
    call_s = m.get('call_s') or 0
    pin_tot = {}; pout_tot = {}; th = 0
    for i, u in enumerate(s['usage']):
        pin, pout = from_usage(u)
        for k, v in pin.items(): pin_tot[k] = pin_tot.get(k, 0) + v
        for k, v in pout.items(): pout_tot[k] = pout_tot.get(k, 0) + v
        th += u.get('thoughtsTokenCount') or 0
        growth_rows.append({'tag': s['tag'], 'tier': s['tier'], 'model': SHORT.get(s['model'], s['model']), 'compression': s['args'].get('compression'),
                            'event': i, 't_s': u.get('t'), 'turn': u.get('turn'), 'prompt_total': u.get('promptTokenCount'),
                            'prompt_text': pin.get('TEXT', 0), 'prompt_audio': pin.get('AUDIO', 0),
                            'prompt_undetailed': (u.get('promptTokenCount') or 0) - sum(pin.values()),
                            'resp_audio': pout.get('AUDIO', 0), 'thoughts': u.get('thoughtsTokenCount') or 0,
                            'cached': u.get('cachedContentTokenCount') or 0, 'usd_event': u.get('usd')})
    s['usd_usage'] = usd; s['usd_tx'] = usd_tx; s['usd_total'] = usd + usd_tx
    s['call_s'] = call_s
    rot = sum(1 for c in m.get('connections', []) if c.get('rotate_reason'))
    sess_rows.append({'tag': s['tag'], 'phase': s['phase'], 'vantage': s['vantage'], 'model': SHORT.get(s['model'], s['model']), 'tier': s['tier'],
                      'minutes_target': s['args'].get('minutes'), 'compression': s['args'].get('compression'), 'script': s['args'].get('script'),
                      'seed': s['args'].get('seed'), 'wall_start_utc': m.get('wall_start_utc'), 'call_s': call_s, 'turns': len(s['turns']),
                      'usage_events': len(s['usage']), 'prompt_text_tok': pin_tot.get('TEXT', 0), 'prompt_audio_tok': pin_tot.get('AUDIO', 0),
                      'resp_audio_tok': pout_tot.get('AUDIO', 0), 'thoughts_tok': th, 'cached_tok': sum(u.get('cachedContentTokenCount') or 0 for u in s['usage']),
                      'tx_out_tok': txo, 'tx_in_tok': txi, 'usd_usage_paid_list': round(usd, 5), 'usd_transcripts': round(usd_tx, 5),
                      'usd_total_paid_list': round(usd + usd_tx, 5),
                      'inr_per_min': round((usd + usd_tx) * FX / (call_s / 60), 3) if call_s else None,
                      'agent_audio_s': m.get('agent_audio_s'), 'caller_speech_s': m.get('caller_speech_s'), 'rotations': rot,
                      'errors': json.dumps(m.get('errors', []))[:300], 'fatal': m.get('fatal', '')})
json.dump(txc, open(TXC, 'w'))
SCOLS = list(sess_rows[0].keys()) if sess_rows else []
wcsv('sessions.csv', sess_rows, SCOLS)
wcsv('token_growth_per_turn.csv', growth_rows, list(growth_rows[0].keys()) if growth_rows else [])

# ------------------------------------------------------------------ cost per connected minute (paid cost phase)
cost_rows = []
for s in sorted([s for s in S if s['phase'] == 'cost'], key=lambda s: (s['model'], s['args']['compression'], s['args']['minutes'], s['tag'])):
    pts = [u.get('promptTokenCount') or 0 for u in s['usage']]
    n = len(pts)
    slope = (pts[-1] - pts[0]) / (n - 1) if n > 1 else None
    _c = s['args']['compression']
    _cl = 'off' if _c == 'off' else (f"on (trigger {_c.split(':')[1]}, target {_c.split(':')[2]})" if _c.startswith('on:') else _c)
    cost_rows.append({'model': SHORT[s['model']], 'minutes_target': s['args']['minutes'], 'compression': _cl,
                      'rep': s['tag'][-1], 'call_s': s['call_s'], 'model_turns_billed': n, 'turns_per_min': round(n / (s['call_s'] / 60), 2) if s['call_s'] else None,
                      'prompt_tok_first': pts[0] if pts else None, 'prompt_tok_last': pts[-1] if pts else None, 'prompt_tok_max': max(pts) if pts else None,
                      'prompt_growth_tok_per_turn': round(slope, 1) if slope is not None else None,
                      'usd_usage': round(s['usd_usage'], 4), 'usd_transcripts': round(s['usd_tx'], 5), 'usd_total': round(s['usd_total'], 4),
                      'usd_per_min': round(s['usd_total'] / (s['call_s'] / 60), 4), 'inr_per_min': round(s['usd_total'] * FX / (s['call_s'] / 60), 2),
                      'rotations': sum(1 for c in s['meta'].get('connections', []) if c.get('rotate_reason')), 'errors': len(s['meta'].get('errors', []))})
wcsv('cost_per_minute.csv', cost_rows, list(cost_rows[0].keys()) if cost_rows else [])
csum = []
for (mo, comp) in sorted({(r['model'], r['compression']) for r in cost_rows}):
    base = [r['inr_per_min'] for r in cost_rows if (r['model'], r['compression'], r['minutes_target']) == (mo, comp, 1.0)]
    if not base:  # tight-compression arm only ran at 10 min; its first minute is identical to the other arms' 1-min calls
        base = [r['inr_per_min'] for r in cost_rows if r['model'] == mo and r['minutes_target'] == 1.0]
    b = sum(base) / len(base)
    for mins in (1.0, 3.0, 5.0, 10.0):
        rs = [r for r in cost_rows if (r['model'], r['compression'], r['minutes_target']) == (mo, comp, mins)]
        if not rs: continue
        v = sum(r['inr_per_min'] for r in rs) / len(rs)
        csum.append({'model': mo, 'compression': comp, 'minutes': mins, 'calls': len(rs), 'inr_per_min_mean': round(v, 2),
                     'inr_per_min_range': f"{min(r['inr_per_min'] for r in rs)}-{max(r['inr_per_min'] for r in rs)}",
                     'usd_per_min_mean': round(v / FX, 4), 'inr_per_call_mean': round(sum(r['usd_total'] for r in rs) / len(rs) * FX, 2),
                     'ratio_vs_1min_per_min': round(v / b, 2), 'turns_per_min_mean': round(sum(r['turns_per_min'] for r in rs) / len(rs), 2),
                     'prompt_tok_max_mean': round(sum(r['prompt_tok_max'] for r in rs) / len(rs))})
wcsv('cost_per_minute_summary.csv', csum, list(csum[0].keys()) if csum else [])

# ------------------------------------------------------------------ turns, latency, gate lag
turn_rows = []
for s in S:
    for t in s['turns']:
        typ = t.get('type') or ''
        lat = t.get('latency_ms')
        ev = t.get('tx_events') or []
        fc = t.get('t_first_chunk')
        gl = round((ev[0][0] - fc) * 1000, 1) if ev and fc is not None else None
        lead_min = None; lead_neg = None; lead_first = None
        single = (t.get('interrupted', 0) == 0 and (t.get('responses') or 0) <= 1)
        C = sum(e[1] for e in ev); A = t.get('agent_audio_s') or 0
        hold_needed = None; ahead_of_text = None
        if single and ev and fc is not None and C > 0 and A > 0.3:
            # char-proportional position of each transcript fragment's first character in the agent audio (estimate),
            # versus the real-time playback position when that fragment arrived (playback starts at the first chunk).
            before = 0; leads = []; ahead = []
            for (tt, ln, arx) in ev:
                pos = before / C * A; played = max(0.0, tt - fc)
                leads.append(pos - played); ahead.append(arx - pos); before += ln
            lead_min = round(min(leads), 3); lead_first = round(leads[0], 3); lead_neg = sum(1 for x in leads if x < -0.02) / len(leads)
            hold_needed = round(max(0.0, max(-x for x in leads)) * 1000, 1)   # playout hold so no fragment plays before its text
            ahead_of_text = round(max(ahead), 3)                               # max audio received ahead of the text it carries
        turn_rows.append({'tag': s['tag'], 'phase': s['phase'], 'vantage': s['vantage'], 'model': SHORT.get(s['model'], s['model']), 'tier': s['tier'],
                          'round': s['tag'].split('_r')[-1] if s['phase'] == 'lat' else '', 'i': t['i'], 'clip': t['clip'], 'type': typ,
                          'clip_s': t.get('clip_s'), 'latency_ms': lat, 'cutin': t.get('cutin'), 'cutin_at_ms': t.get('cutin_at_ms'),
                          'no_reply': t.get('no_reply', False), 'interrupted': t.get('interrupted'), 'responses': t.get('responses'),
                          'agent_audio_s': round(A, 3), 'gate_lag_ms': gl, 'audio_rx_s_at_first_tx': t.get('audio_rx_s_at_first_tx'),
                          'tx_lead_first_s': lead_first, 'tx_lead_min_s': lead_min, 'tx_frag_share_behind_playback': round(lead_neg, 3) if lead_neg is not None else None,
                          'hold_needed_ms': hold_needed, 'audio_ahead_of_text_max_s': ahead_of_text, 'tx_fragments': len(ev),
                          'outtx': (t.get('outtx') or '')[:240], 'intx': (t.get('intx') or '')[:160]})
wcsv('turns.csv', turn_rows, list(turn_rows[0].keys()) if turn_rows else [])

def valid_lat(r, clean=False):
    if r['type'] == 'silence' or r['latency_ms'] is None or r['cutin']: return False
    if clean and r['type'] not in ('say', 'short'): return False
    return True
lat_rows = []
for phase_set, label in ((('lat',), 'paired latency calls (2 min)'), (('cost',), 'cost calls (sandbox, paid, P1)')):
    keys = sorted({(r['model'], r['tier'], r['vantage']) for r in turn_rows if r['phase'] in phase_set})
    for (mo, ti, va) in keys:
        for clean in (False, True):
            rs = [r for r in turn_rows if r['phase'] in phase_set and (r['model'], r['tier'], r['vantage']) == (mo, ti, va)]
            calls = sorted({r['tag'] for r in rs})
            groups = [[r['latency_ms'] for r in rs if r['tag'] == c and valid_lat(r, clean)] for c in calls]
            xs = [x for g in groups for x in g]
            nonsil = [r for r in rs if r['type'] != 'silence']
            cut = sum(1 for r in nonsil if r['cutin']); noreply = sum(1 for r in nonsil if r['no_reply'])
            lo, hi = cboot(groups, 0.5); lo9, hi9 = cboot(groups, 0.9)
            lat_rows.append({'set': label, 'turns': 'clean (say+short)' if clean else 'all reply turns', 'model': mo, 'tier': ti, 'vantage': va,
                             'calls': len(calls), 'n': len(xs), 'p50_ms': f0(pct(xs, .5)), 'p50_ci95_call_cluster': f'{f0(lo)}-{f0(hi)}',
                             'p90_ms': f0(pct(xs, .9)), 'p90_ci95_call_cluster': f'{f0(lo9)}-{f0(hi9)}',
                             'share_le_1200ms': f'{sum(1 for x in xs if x <= 1200)}/{len(xs)}', 'share_le_1500ms': f'{sum(1 for x in xs if x <= 1500)}/{len(xs)}',
                             'cutin_turns': f'{cut}/{len(nonsil)}', 'no_reply_turns': f'{noreply}/{len(nonsil)}'})
wcsv('latency_summary.csv', lat_rows, list(lat_rows[0].keys()) if lat_rows else [])

# paired paid - free, by (model, vantage), resampling rounds
pair_rows = []
for (mo, va) in sorted({(r['model'], r['vantage']) for r in turn_rows if r['phase'] == 'lat'}):
    rounds = sorted({r['round'] for r in turn_rows if r['phase'] == 'lat' and (r['model'], r['vantage']) == (mo, va)})
    by = {}
    for rd in rounds:
        for ti in ('paid', 'free'):
            by[(rd, ti)] = [r['latency_ms'] for r in turn_rows if r['phase'] == 'lat' and (r['model'], r['vantage'], r['round'], r['tier']) == (mo, va, rd, ti) and valid_lat(r)]
    rr = [rd for rd in rounds if by[(rd, 'paid')] and by[(rd, 'free')]]
    if not rr: continue
    diffs = [statistics.median(by[(rd, 'paid')]) - statistics.median(by[(rd, 'free')]) for rd in rr]
    P = [x for rd in rr for x in by[(rd, 'paid')]]; F = [x for rd in rr for x in by[(rd, 'free')]]
    est = []
    for _ in range(2000):
        smp = [random.choice(rr) for _ in rr]
        p = [x for rd in smp for x in by[(rd, 'paid')]]; f = [x for rd in smp for x in by[(rd, 'free')]]
        est.append(pct(p, .5) - pct(f, .5))
    pair_rows.append({'model': mo, 'vantage': va, 'rounds_paired': len(rr), 'n_paid': len(P), 'n_free': len(F),
                      'p50_paid_ms': f0(pct(P, .5)), 'p50_free_ms': f0(pct(F, .5)), 'p50_diff_paid_minus_free_ms': f0(pct(P, .5) - pct(F, .5)),
                      'diff_ci95_round_cluster': f'{f0(pct(est, .025))} to {f0(pct(est, .975))}',
                      'p90_paid_ms': f0(pct(P, .9)), 'p90_free_ms': f0(pct(F, .9)),
                      'median_of_round_median_diffs_ms': f0(statistics.median(diffs)), 'rounds_paid_faster': f'{sum(1 for d in diffs if d < 0)}/{len(diffs)}'})
wcsv('latency_paired_paid_vs_free.csv', pair_rows, list(pair_rows[0].keys()) if pair_rows else [])

# gate lag summary (paid and free, all phases with transcription on)
gate_rows = []
for (mo, ti, va) in sorted({(r['model'], r['tier'], r['vantage']) for r in turn_rows}):
    rs = [r for r in turn_rows if (r['model'], r['tier'], r['vantage']) == (mo, ti, va) and r['gate_lag_ms'] is not None and r['type'] != 'silence']
    if not rs: continue
    g = [r['gate_lag_ms'] for r in rs]
    lm = [r['tx_lead_min_s'] for r in rs if r['tx_lead_min_s'] is not None]
    hn = [r['hold_needed_ms'] for r in rs if r['hold_needed_ms'] is not None]
    ah = [r['audio_ahead_of_text_max_s'] for r in rs if r['audio_ahead_of_text_max_s'] is not None]
    rx = [r['audio_rx_s_at_first_tx'] for r in rs if r['audio_rx_s_at_first_tx'] is not None]
    gate_rows.append({'model': mo, 'tier': ti, 'vantage': va, 'turns': len(rs),
                      'first_tx_minus_first_audio_ms_p50': f0(pct(g, .5)), 'p90': f0(pct(g, .9)), 'max': f0(max(g)),
                      'turns_tx_at_or_before_first_audio': f'{sum(1 for x in g if x <= 0)}/{len(g)}',
                      'turns_tx_after_first_audio_gt_100ms': f'{sum(1 for x in g if x > 100)}/{len(g)}',
                      'audio_s_received_at_first_tx_p50': round(pct(rx, .5), 3) if rx else '',
                      'single_response_turns': len(lm),
                      'hold_needed_ms_p50': f0(pct(hn, .5)) if hn else '', 'hold_needed_ms_p90': f0(pct(hn, .9)) if hn else '', 'hold_needed_ms_max': f0(max(hn)) if hn else '',
                      'turns_hold_needed_gt_100ms': f'{sum(1 for x in hn if x > 100)}/{len(hn)}' if hn else '',
                      'audio_ahead_of_text_max_s_p50': round(pct(ah, .5), 2) if ah else '', 'audio_ahead_of_text_max_s_p90': round(pct(ah, .9), 2) if ah else ''})
wcsv('gate_lag_summary.csv', gate_rows, list(gate_rows[0].keys()) if gate_rows else [])

# ------------------------------------------------------------------ paid vs free metering (same script, config, seed)
meter_rows = []
g2 = load_sessions([f'{G2RAW}/runs_us', f'{G2RAW}/runs_in'])
for s in S:
    if s['phase'] not in ('cost', 'lat'): continue
    cands = []
    if s['phase'] == 'cost':
        cands = [g for g in g2 if g['model'] == s['model'] and g['args'].get('minutes') == s['args']['minutes'] and g['args'].get('compression') == s['args']['compression']
                 and g['args'].get('seed') == s['args']['seed'] and g['args'].get('script') == s['args']['script'] and g['vantage'] == 'sandbox-us-east-proxy']
    for g in cands[:1]:
        def per_min(x):
            pi = sum(d['tokenCount'] for u in x['usage'] for d in u.get('promptTokensDetails', []) if d['modality'] == 'AUDIO')
            pt = sum(d['tokenCount'] for u in x['usage'] for d in u.get('promptTokensDetails', []) if d['modality'] == 'TEXT')
            ro = sum(d['tokenCount'] for u in x['usage'] for d in u.get('responseTokensDetails', []) if d['modality'] == 'AUDIO')
            cs = x['meta'].get('call_s') or 1
            return pi / cs * 60, pt / cs * 60, ro / cs * 60, len(x['usage']) / cs * 60
        a1, t1, r1, e1 = per_min(s); a2, t2, r2, e2 = per_min(g)
        meter_rows.append({'paid_tag (g5)': s['tag'], 'free_tag (g2)': g['tag'], 'model': SHORT[s['model']],
                           'paid_prompt_audio_tok_per_min': round(a1), 'free_prompt_audio_tok_per_min': round(a2),
                           'paid_prompt_text_tok_per_min': round(t1), 'free_prompt_text_tok_per_min': round(t2),
                           'paid_resp_audio_tok_per_min': round(r1), 'free_resp_audio_tok_per_min': round(r2),
                           'paid_usage_events_per_min': round(e1, 2), 'free_usage_events_per_min': round(e2, 2),
                           'paid_first_prompt': s['usage'][0]['promptTokenCount'] if s['usage'] else None,
                           'free_first_prompt': g['usage'][0]['promptTokenCount'] if g['usage'] else None})
# also paired latency calls: paid vs free g5 sessions with identical script+seed
for s in S:
    if s['phase'] != 'lat' or s['tier'] != 'paid': continue
    f = [x for x in S if x['phase'] == 'lat' and x['tier'] == 'free' and x['tag'] == s['tag'].replace('_paid_', '_free_')]
    for g in f:
        meter_rows.append({'paid_tag (g5)': s['tag'], 'free_tag (g2)': g['tag'] + ' (g5 free)', 'model': SHORT[s['model']],
                           'paid_first_prompt': s['usage'][0]['promptTokenCount'] if s['usage'] else None,
                           'free_first_prompt': g['usage'][0]['promptTokenCount'] if g['usage'] else None,
                           'paid_usage_events_per_min': round(len(s['usage']) / max(s['call_s'], 1) * 60, 2),
                           'free_usage_events_per_min': round(len(g['usage']) / max(g['meta'].get('call_s') or 1, 1) * 60, 2)})
wcsv('metering_paid_vs_free.csv', meter_rows, ['paid_tag (g5)', 'free_tag (g2)', 'model', 'paid_prompt_audio_tok_per_min', 'free_prompt_audio_tok_per_min',
                                               'paid_prompt_text_tok_per_min', 'free_prompt_text_tok_per_min', 'paid_resp_audio_tok_per_min', 'free_resp_audio_tok_per_min',
                                               'paid_usage_events_per_min', 'free_usage_events_per_min', 'paid_first_prompt', 'free_first_prompt'])

# ------------------------------------------------------------------ TTS
tts = jl(f'{RAW}/vm/tts_in/tts.jsonl') + jl(f'{RAW}/tts_smoke/tts.jsonl')
tts_rows = []
for (va, mo, mode) in sorted({(r['vantage'], r['model'], r['mode']) for r in tts}):
    rs = [r for r in tts if (r['vantage'], r['model'], r['mode']) == (va, mo, mode) and r.get('http') == 200 and r.get('audio_s')]
    if not rs: continue
    tt = [r['ttfb_ms'] for r in rs]; tot = [r['total_ms'] for r in rs]; rtf = [r['rtf'] for r in rs]
    au = sum(r['audio_s'] for r in rs); usd = sum(r['usd'] for r in rs); usd27 = sum(r['usd_2027'] for r in rs)
    tts_rows.append({'vantage': va, 'model': mo, 'mode': mode, 'n': len(rs), 'lines': len({r['line'] for r in rs}),
                     'ttfb_ms_p50': f0(pct(tt, .5)), 'ttfb_ms_p90': f0(pct(tt, .9)), 'total_ms_p50': f0(pct(tot, .5)),
                     'rtf_p50': round(pct(rtf, .5), 3), 'rtf_p90': round(pct(rtf, .9), 3), 'audio_s_mean': round(au / len(rs), 2),
                     'chars_per_audio_s': round(sum(r['chars'] for r in rs) / au, 2),
                     'audio_tok_per_s': round(sum(r['audio_out_tok'] for r in rs) / au, 2),
                     'usd_per_spoken_min_now': round(usd / au * 60, 5), 'inr_per_spoken_min_now': round(usd / au * 60 * FX, 3),
                     'usd_per_spoken_min_2027': round(usd27 / au * 60, 5), 'inr_per_spoken_min_2027': round(usd27 / au * 60 * FX, 3),
                     'errors': sum(1 for r in tts if (r['vantage'], r['model'], r['mode']) == (va, mo, mode) and r.get('http') != 200)})
wcsv('tts_summary.csv', tts_rows, list(tts_rows[0].keys()) if tts_rows else [])
wcsv('tts_requests.csv', [{k: v for k, v in r.items() if k != 'usage'} for r in tts],
     ['utc', 'vantage', 'line', 'style', 'chars', 'model', 'mode', 'http', 'err', 'ttfb_ms', 'total_ms', 'audio_s', 'rtf', 'chunks', 'mime', 'text_in_tok', 'audio_out_tok', 'other_out_tok', 'usd', 'usd_2027'])

# ------------------------------------------------------------------ quality observations (factual, not human-likeness)
import re
BAT = {}
for _p in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'battery.json')))['personas']:
    for _t in _p['turns']: BAT[_t['id']] = _t
def script_share(txt):
    dev = sum(1 for ch in txt if 'ऀ' <= ch <= 'ॿ'); tam = sum(1 for ch in txt if '஀' <= ch <= '௿')
    lat = sum(1 for ch in txt if ch.isascii() and ch.isalpha()); tot = dev + tam + lat
    return (dev / tot, tam / tot, lat / tot) if tot else (0, 0, 0)
q_rows = []; lang_rows = []
for s in S:
    if s['phase'] not in ('lat', 'cost', 'sample'): continue
    for t in s['turns']:
        b = BAT.get(t['clip']); out = t.get('outtx') or ''
        if b and b.get('expect') and t['type'] != 'silence':
            hit = any(re.search(p, out, re.I) for p in b['expect']); deny = any(re.search(p, out, re.I) for p in b.get('deny', []))
            q_rows.append({'tag': s['tag'], 'model': SHORT[s['model']], 'tier': s['tier'], 'vantage': s['vantage'], 'clip': t['clip'], 'trap': b['trap'],
                           'expect_hit_same_turn': hit, 'deny_hit': deny, 'reply_chars': len(out), 'outtx': out[:200]})
        persona = t['clip'][:2] if t['clip'][:1] in 'PW' else ''
        if out and persona:
            d, ta, la = script_share(out)
            lang_rows.append({'tag': s['tag'], 'model': SHORT[s['model']], 'tier': s['tier'], 'persona': persona, 'dev': d, 'tam': ta, 'lat': la})
wcsv('quality_trap_checks.csv', q_rows, list(q_rows[0].keys()) if q_rows else [])
qs_rows = []
for (mo, ti, trap) in sorted({(r['model'], r['tier'], r['trap']) for r in q_rows}):
    rs = [r for r in q_rows if (r['model'], r['tier'], r['trap']) == (mo, ti, trap)]
    qs_rows.append({'model': mo, 'tier': ti, 'trap': trap, 'n': len(rs), 'expect_hit_same_turn': f"{sum(r['expect_hit_same_turn'] for r in rs)}/{len(rs)}",
                    'deny_hits': sum(r['deny_hit'] for r in rs)})
wcsv('quality_trap_summary.csv', qs_rows, ['model', 'tier', 'trap', 'n', 'expect_hit_same_turn', 'deny_hits'])
ls_rows = []
for (mo, ti, pe) in sorted({(r['model'], r['tier'], r['persona']) for r in lang_rows}):
    rs = [r for r in lang_rows if (r['model'], r['tier'], r['persona']) == (mo, ti, pe)]
    ls_rows.append({'model': mo, 'tier': ti, 'persona': pe, 'replies': len(rs), 'devanagari_share_mean': round(sum(r['dev'] for r in rs) / len(rs), 3),
                    'tamil_share_mean': round(sum(r['tam'] for r in rs) / len(rs), 3), 'latin_share_mean': round(sum(r['lat'] for r in rs) / len(rs), 3),
                    'replies_mostly_tamil': sum(1 for r in rs if r['tam'] > 0.5), 'replies_mostly_devanagari': sum(1 for r in rs if r['dev'] > 0.5),
                    'replies_mostly_latin': sum(1 for r in rs if r['lat'] > 0.5)})
wcsv('quality_reply_script_by_persona.csv', ls_rows, list(ls_rows[0].keys()) if ls_rows else [])
pause_rows = []
for (mo, ti, va) in sorted({(r['model'], r['tier'], r['vantage']) for r in turn_rows if r['clip'] == 'P4_t03'}):
    rs = [r for r in turn_rows if r['clip'] == 'P4_t03' and (r['model'], r['tier'], r['vantage']) == (mo, ti, va)]
    pause_rows.append({'model': mo, 'tier': ti, 'vantage': va, 'pause_clip_turns': len(rs), 'cutins': sum(1 for r in rs if r['cutin']),
                       'cutin_at_ms': ';'.join(str(r['cutin_at_ms']) for r in rs if r['cutin'])})
wcsv('quality_elderly_pause_cutins.csv', pause_rows, ['model', 'tier', 'vantage', 'pause_clip_turns', 'cutins', 'cutin_at_ms'])
# mid-reply underrun: a real-time player that starts at the first chunk runs dry when playback time exceeds audio received
# (sampled at each transcript fragment; a lower bound on stalls)
st_rows = []
for s in S:
    if s['phase'] not in ('lat', 'cost', 'sample'): continue
    for t in s['turns']:
        ev = t.get('tx_events') or []; fc = t.get('t_first_chunk')
        if not ev or fc is None or t.get('interrupted', 0) or (t.get('responses') or 0) > 1: continue
        und = max([0.0] + [(tt - fc) - arx for (tt, ln, arx) in ev])
        st_rows.append({'model': SHORT[s['model']], 'tier': s['tier'], 'vantage': s['vantage'], 'und': und})
stall = []
for (mo, ti, va) in sorted({(r['model'], r['tier'], r['vantage']) for r in st_rows}):
    rs = [r['und'] for r in st_rows if (r['model'], r['tier'], r['vantage']) == (mo, ti, va)]
    stall.append({'model': mo, 'tier': ti, 'vantage': va, 'single_response_turns': len(rs),
                  'turns_underrun_gt_0.3s': sum(1 for x in rs if x > 0.3), 'turns_underrun_gt_1s': sum(1 for x in rs if x > 1.0),
                  'max_underrun_s': round(max(rs), 2)})
wcsv('quality_midreply_stalls.csv', stall, ['model', 'tier', 'vantage', 'single_response_turns', 'turns_underrun_gt_0.3s', 'turns_underrun_gt_1s', 'max_underrun_s'])

# ------------------------------------------------------------------ print
def show(rows, cols):
    print(' | '.join(cols))
    for r in rows: print(' | '.join(str(r.get(c, '')) for c in cols))
print('\nLATENCY'); show(lat_rows, ['set', 'turns', 'model', 'tier', 'vantage', 'calls', 'n', 'p50_ms', 'p50_ci95_call_cluster', 'p90_ms', 'p90_ci95_call_cluster', 'cutin_turns', 'no_reply_turns'])
print('\nPAIRED'); show(pair_rows, list(pair_rows[0].keys()) if pair_rows else [])
print('\nCOST'); show(cost_rows, ['model', 'minutes_target', 'compression', 'rep', 'call_s', 'model_turns_billed', 'prompt_tok_first', 'prompt_tok_max', 'prompt_growth_tok_per_turn', 'usd_total', 'inr_per_min', 'rotations', 'errors'])
print('\nCOST SUMMARY'); show(csum, list(csum[0].keys()) if csum else [])
print('\nGATE'); show(gate_rows, list(gate_rows[0].keys()) if gate_rows else [])
print('\nQUALITY traps'); show(qs_rows, ['model', 'tier', 'trap', 'n', 'expect_hit_same_turn', 'deny_hits'])
print('\nQUALITY script'); show(ls_rows, list(ls_rows[0].keys()) if ls_rows else [])
print('\nELDERLY pause'); show(pause_rows, ['model', 'tier', 'vantage', 'pause_clip_turns', 'cutins', 'cutin_at_ms'])
print('\nTTS'); show(tts_rows, ['vantage', 'model', 'mode', 'n', 'ttfb_ms_p50', 'ttfb_ms_p90', 'rtf_p50', 'audio_s_mean', 'chars_per_audio_s', 'inr_per_spoken_min_now', 'inr_per_spoken_min_2027', 'errors'])
