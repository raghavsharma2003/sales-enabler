# g2-gemini-live-measured: turn raw Live-call logs into results/*.csv (cost, token growth, latency, cut-ins, gate lag).
# Usage: python analyze.py RAW_DIR [RAW_DIR ...]  (each RAW_DIR holds one folder per call: meta.json, turns.jsonl, usage.jsonl, messages.jsonl)
import json, os, sys, csv, glob, math, random, statistics, re
LANE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(LANE, 'results'); os.makedirs(RES, exist_ok=True)
FX = 95.0
PRICES_JSON = '/home/user/sales-enabler/research/2026-10-18/lanes/g1-gemini-desk/prices.json'
# USD per 1M tokens, read from g1 prices.json (Gemini API, standard paid tier, page dated 2026-10-16/18)
PRICE_ALIAS = {'gemini-2.5-flash-native-audio-latest': 'gemini-2.5-flash-native-audio-preview-12-2025'}
def load_prices():
    d = json.load(open(PRICES_JSON)); P = {}
    for p in d['prices']:
        if p['surface'] != 'gemini-api' or p['tier'] != 'standard': continue
        mod = p['modality'].split('/')[0]
        P.setdefault(p['model'], {})[(mod, p['direction'])] = p['usd_per_1m']
    return P
PR = load_prices()
def price(model, mod, direction):
    m = PRICE_ALIAS.get(model, model)
    return PR[m][(mod, direction)]
TX_TOK_PER_CHAR = None  # set from calibration file (countTokens on transcripts), else fallback

def load_calls(dirs):
    calls = []
    for d in dirs:
        for f in sorted(glob.glob(os.path.join(d, '*', 'meta.json'))):
            cd = os.path.dirname(f)
            if '__fail' in cd: continue
            meta = json.load(open(f))
            if 'fatal' in meta or not os.path.exists(os.path.join(cd, 'turns.jsonl')): continue
            turns = [json.loads(l) for l in open(os.path.join(cd, 'turns.jsonl'))]
            usage = [json.loads(l) for l in open(os.path.join(cd, 'usage.jsonl'))]
            msgs = [json.loads(l) for l in open(os.path.join(cd, 'messages.jsonl'))]
            a = meta['args']
            tag = a['tag']
            vantage = 'india-centralindia-vm' if tag.startswith('in_') else 'sandbox-us-east-proxy'
            calls.append({'dir': cd, 'tag': tag, 'meta': meta, 'args': a, 'turns': turns, 'usage': usage, 'msgs': msgs, 'vantage': vantage})
    return calls

def mods(lst):
    return {x['modality']: x['tokenCount'] for x in (lst or [])}

def usage_cost(model, u):
    pin = mods(u.get('promptTokensDetails')); rout = mods(u.get('responseTokensDetails'))
    c = 0.0
    c += pin.get('TEXT', 0) * price(model, 'text', 'input')
    c += pin.get('AUDIO', 0) * price(model, 'audio', 'input')
    c += (pin.get('IMAGE', 0) + pin.get('VIDEO', 0)) * price(model, 'image' if 'image' in [k[0] for k in PR[PRICE_ALIAS.get(model, model)]] else 'audio', 'input')
    c += rout.get('AUDIO', 0) * price(model, 'audio', 'output')
    c += rout.get('TEXT', 0) * price(model, 'text', 'output')
    c += (u.get('thoughtsTokenCount') or 0) * price(model, 'text', 'output')
    # any response tokens not broken down by modality: bill as audio out (conservative)
    unbroken = (u.get('responseTokenCount') or 0) - sum(rout.values())
    if unbroken > 0: c += unbroken * price(model, 'audio', 'output')
    return c / 1e6

def tx_chars(call):
    return sum(len(t.get('intx', '')) + len(t.get('outtx', '')) for t in call['turns'])

def label(call):
    a = call['args']
    return {'model': a['model'], 'minutes_target': a['minutes'], 'compression': a['compression'], 'vad': a['vad'], 'script': a['script'],
            'flags': ' '.join(x for x in [f"api={a['api']}", f"lang={a['lang'] or '-'}", f"thinking={a['thinking']}", 'affective' if a['affective'] else '', 'proactive' if a['proactive'] else ''] if x)}

# ------------------------------------------------------------------ cost
def cost_tables(calls):
    rows = []; growth = []
    for c in calls:
        m = c['args']['model']; call_min = c['meta']['call_s'] / 60
        tin = ain = aout = tout = th = cached = 0; usd = 0.0
        for i, u in enumerate(c['usage']):
            pin = mods(u.get('promptTokensDetails')); rout = mods(u.get('responseTokensDetails'))
            tin += pin.get('TEXT', 0); ain += pin.get('AUDIO', 0); aout += rout.get('AUDIO', 0); tout += rout.get('TEXT', 0)
            th += u.get('thoughtsTokenCount') or 0; cached += u.get('cachedContentTokenCount') or 0
            uc = usage_cost(m, u); usd += uc
            growth.append({'tag': c['tag'], 'vantage': c['vantage'], **label(c), 'invocation': i, 'turn': u.get('turn'), 't_s': u['t'],
                           'prompt_tokens': u.get('promptTokenCount'), 'prompt_text': pin.get('TEXT', 0), 'prompt_audio': pin.get('AUDIO', 0),
                           'resp_audio': rout.get('AUDIO', 0), 'thoughts': u.get('thoughtsTokenCount') or 0, 'cached': u.get('cachedContentTokenCount') or 0,
                           'usd': round(uc, 6)})
        chars = tx_chars(c)
        tx_tok = chars * TX_TOK_PER_CHAR
        tx_usd = tx_tok * price(m, 'text', 'output') / 1e6
        n_inv = len(c['usage']); n_resp = sum(1 for t in c['turns'] if t['t_first_audio'] or t['cutin'])
        rows.append({'tag': c['tag'], 'vantage': c['vantage'], **label(c), 'call_min': round(call_min, 3), 'turns': len(c['turns']), 'invocations': n_inv,
                     'caller_speech_s': c['meta']['caller_speech_s'], 'agent_audio_s': c['meta']['agent_audio_s'],
                     'in_text_tok': tin, 'in_audio_tok': ain, 'out_audio_tok': aout, 'out_text_tok': tout, 'thought_tok': th, 'cached_tok': cached,
                     'final_prompt_tok': c['usage'][-1].get('promptTokenCount') if c['usage'] else None,
                     'usd_usage': round(usd, 5), 'inr_usage': round(usd * FX, 3), 'inr_per_min_usage': round(usd * FX / call_min, 3),
                     'tx_chars': chars, 'tx_tok_est': round(tx_tok), 'inr_tx_est': round(tx_usd * FX, 3),
                     'inr_per_min_incl_tx': round((usd + tx_usd) * FX / call_min, 3),
                     'resumptions': sum(1 for x in c['meta']['connections'] if x.get('resumed')), 'errors': len(c['meta']['errors'])})
    return rows, growth

# ------------------------------------------------------------------ latency, cut-ins, VAD decomposition
def pct(xs, q):
    xs = sorted(xs)
    if not xs: return None
    k = (len(xs) - 1) * q; f = math.floor(k); cc = math.ceil(k)
    return xs[f] if f == cc else xs[f] + (xs[cc] - xs[f]) * (k - f)

def cluster_ci(groups, q, reps=2000, seed=7):
    rnd = random.Random(seed); keys = list(groups)
    if len(keys) < 2: return (None, None)
    est = []
    for _ in range(reps):
        pool = []
        for _k in keys: pool += groups[rnd.choice(keys)]
        if pool: est.append(pct(pool, q))
    return (round(pct(est, 0.025)), round(pct(est, 0.975)))

def conn_for(call, t):
    cs = [x for x in call['meta']['connections'] if 'first_frame_t' in x and x['first_frame_t'] <= t + 1e-6]
    return cs[-1] if cs else None

def turn_rows(calls):
    rows = []
    for c in calls:
        P = {}
        for t in c['turns']:
            clip = t['clip']; is_sil = clip.startswith('SIL')
            va_end = None; va_end_arr = None
            for ta, va in t.get('va', []):
                if va.get('type') == 'ACTIVITY_END' and t['t_eos'] is not None and ta >= t['t_start']:
                    cn = conn_for(c, ta)
                    if cn:
                        off = float(va['audioOffset'].rstrip('s'))
                        cand = cn['first_frame_t'] + off
                        if cand >= t['t_eos'] - 0.05 and va_end is None:
                            va_end = cand; va_end_arr = ta
            r = {'tag': c['tag'], 'vantage': c['vantage'], **label(c), 'i': t['i'], 'clip': clip, 'clip_s': t['clip_s'], 'silence_turn': is_sil,
                 'latency_ms': t['latency_ms'], 'cutin': t['cutin'], 'cutin_at_ms': t['cutin_at_ms'], 'no_reply': bool(t.get('no_reply')),
                 'interrupted': t['interrupted'], 'agent_audio_s': round(t['agent_audio_s'], 2),
                 'vad_end_after_eos_ms': round((va_end - t['t_eos']) * 1000) if va_end else None,
                 'first_audio_after_vad_end_ms': round((t['t_first_audio'] - va_end) * 1000) if (va_end and t['t_first_audio']) else None,
                 'vad_end_msg_lag_ms': round((va_end_arr - va_end) * 1000) if va_end else None,
                 'intx': t['intx'][:200], 'outtx': t['outtx'][:300]}
            rows.append(r)
    return rows

def latency_summary(trows, by_script=False):
    out = []
    keyf = (lambda r: (r['vantage'], r['model'], r['vad'], r['flags'], r['script'])) if by_script else (lambda r: (r['vantage'], r['model'], r['vad'], r['flags']))
    groups = {}
    for r in trows:
        groups.setdefault(keyf(r), []).append(r)
    for k, rs in sorted(groups.items()):
        clean = [r for r in rs if not r['silence_turn'] and not r['cutin'] and r['latency_ms'] is not None]
        by_call = {}
        for r in clean: by_call.setdefault(r['tag'], []).append(r['latency_ms'])
        lat = [r['latency_ms'] for r in clean]
        spoken = [r for r in rs if not r['silence_turn']]
        vad = [r['vad_end_after_eos_ms'] for r in clean if r['vad_end_after_eos_ms'] is not None]
        mdl = [r['first_audio_after_vad_end_ms'] for r in clean if r['first_audio_after_vad_end_ms'] is not None]
        p50ci = cluster_ci(by_call, 0.5); p90ci = cluster_ci(by_call, 0.9)
        out.append({'vantage': k[0], 'model': k[1], 'vad': k[2], 'flags': k[3], **({'script': k[4]} if by_script else {}), 'calls': len(set(r['tag'] for r in rs)), 'spoken_turns': len(spoken), 'clean_turns': len(clean),
                    'p50_ms': round(pct(lat, .5)) if lat else None, 'p50_ci_lo': p50ci[0], 'p50_ci_hi': p50ci[1],
                    'p90_ms': round(pct(lat, .9)) if lat else None, 'p90_ci_lo': p90ci[0], 'p90_ci_hi': p90ci[1],
                    'share_le_1200ms': round(sum(1 for x in lat if x <= 1200) / len(lat), 3) if lat else None,
                    'cutin_rate_spoken': round(sum(1 for r in spoken if r['cutin']) / len(spoken), 3) if spoken else None,
                    'no_reply_rate_spoken': round(sum(1 for r in spoken if r['no_reply']) / len(spoken), 3) if spoken else None,
                    'vad_end_after_eos_p50_ms': round(pct(vad, .5)) if vad else None,
                    'first_audio_after_vad_end_p50_ms': round(pct(mdl, .5)) if mdl else None})
    return out

def cutin_summary(trows):
    out = []
    pauses = {}
    pp = '/home/user/sales-enabler/research/2026-10-17/lanes/l8-azure-bench/round2/results/clip_pauses.csv'
    for r in csv.DictReader(open(pp)): pauses[r['clip']] = int(r['longest_pause_ms'])
    groups = {}
    for r in trows:
        if r['silence_turn'] or not r['clip'].startswith('P'): continue
        lp = pauses.get(r['clip'], 0)
        cls = 'P4_t03 (2.42 s pause)' if r['clip'] == 'P4_t03' else ('pause 0.9-1.3 s' if lp >= 900 else ('pause 0.5-0.9 s' if lp >= 500 else 'no pause >=0.5 s'))
        groups.setdefault((r['vantage'], r['model'], r['vad'], 'thinking=budget0' in r['flags'] and r['model'] == 'gemini-3.8-live', cls), []).append(r)
    for k, rs in sorted(groups.items()):
        n = len(rs); x = sum(1 for r in rs if r['cutin'])
        lo, hi = wilson(x, n)
        out.append({'vantage': k[0], 'model': k[1], 'vad': k[2], 'g38_thinking_budget0': k[3], 'pause_class': k[4], 'turns': n, 'cutins': x, 'rate': round(x / n, 3), 'wilson_lo': lo, 'wilson_hi': hi,
                    'median_cutin_at_ms': round(statistics.median([r['cutin_at_ms'] for r in rs if r['cutin']])) if x else None})
    return out

def wilson(x, n, z=1.96):
    if n == 0: return (None, None)
    p = x / n; d = 1 + z * z / n; c = p + z * z / (2 * n); s = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (round((c - s) / d, 3), round((c + s) / d, 3))

# ------------------------------------------------------------------ gate lag (V3)
CLAUSE_END = re.compile(r'[\u0964\u0965?!.,;:]')
def gate_rows(calls):
    """V3 gate lag. Replay each call's messages through a real-time player (playback starts when the first audio chunk
    arrives, continues without gaps unless the stream under-runs). Each output-transcript fragment is placed in the
    response audio by proportional character alignment (offset = chars before it / total chars x response audio
    duration; an approximation, +-~300 ms). lead = time that audio offset plays - time the fragment arrived
    (negative = the words were already audible when their text arrived). The clause gate = the moment the first
    clause (first clause punctuation or 6 words) is complete in text; we report how much audio had played by then."""
    rows = []
    for c in calls:
        play_end = 0.0; resp = None; ri = 0
        def close(resp):
            if not resp or not resp['chunks']: return
            fr = resp['frags']; tot_chars = sum(len(f['text']) for f in fr) or 1
            total_s = sum(d for _, d in resp['chunks']); words_total = sum(len(f['text'].split()) for f in fr)
            sched = []; off = 0.0
            for st, d in resp['chunks']: sched.append((off, st, d)); off += d
            def playtime(x):
                for o, st, d in sched:
                    if x <= o + d: return st + (x - o)
                return sched[-1][1] + sched[-1][2]
            play_start = sched[0][1]
            cum = 0; leads = []; late = {0: 0, 200: 0, 500: 0}; t_clause = None; acc = ''
            for f in fr:
                o = cum / tot_chars * total_s; lead = (playtime(o) - f['t']) * 1000; leads.append(lead)
                nw = len(f['text'].split())
                for h in late:
                    if lead < -h: late[h] += nw
                cum += len(f['text']); acc += f['text']
                if t_clause is None and (CLAUSE_END.search(f['text']) or len(acc.split()) >= 6): t_clause = f['t']
            first_tx = fr[0]['t'] if fr else None
            played_clause = max(0.0, t_clause - play_start) if t_clause is not None else None
            rows.append({'tag': c['tag'], 'vantage': c['vantage'], **label(c), 'response': resp['idx'], 'audio_s': round(total_s, 2), 'words': words_total,
                         'first_tx_minus_first_audio_ms': round((first_tx - play_start) * 1000, 1) if first_tx is not None else None,
                         'played_before_first_tx_ms': round(max(0, first_tx - play_start) * 1000, 1) if first_tx is not None else None,
                         'clause_text_complete_after_play_start_ms': round(played_clause * 1000, 1) if played_clause is not None else None,
                         'words_played_before_clause_gate': round(played_clause / total_s * words_total, 2) if (played_clause is not None and total_s) else None,
                         'min_lead_ms': round(min(leads), 1) if leads else None, 'median_lead_ms': round(statistics.median(leads), 1) if leads else None,
                         'hold_needed_ms': round(max([0] + [-x for x in leads]), 1),
                         'words_late_hold0': late[0], 'words_late_hold200': late[200], 'words_late_hold500': late[500],
                         'interrupted': resp['interrupted'], 'text': ''.join(f['text'] for f in fr)[:200]})
        for m in c['msgs']:
            t = m['t']
            if resp is None and ('audio_bytes' in m or 'outtx' in m):
                resp = {'idx': ri, 'chunks': [], 'frags': [], 'interrupted': False}; ri += 1
            if resp is None: continue
            if m.get('audio_bytes', 0) > 2:
                dur = m['audio_bytes'] / 2 / 24000
                st = max(play_end, t); play_end = st + dur
                resp['chunks'].append((st, dur))
            if m.get('outtx'):
                resp['frags'].append({'t': t, 'text': m['outtx']})
            if m.get('interrupted'):
                resp['interrupted'] = True; play_end = min(play_end, t)
            if m.get('turnComplete') or m.get('interrupted'):
                close(resp); resp = None
        close(resp)
    return rows

def gate_summary(grows):
    out = []; groups = {}
    for r in grows: groups.setdefault((r['vantage'], r['model']), []).append(r)
    for k, rs in sorted(groups.items()):
        ft = [r['first_tx_minus_first_audio_ms'] for r in rs if r['first_tx_minus_first_audio_ms'] is not None]
        cl = [r['clause_text_complete_after_play_start_ms'] for r in rs if r['clause_text_complete_after_play_start_ms'] is not None]
        wc = [r['words_played_before_clause_gate'] for r in rs if r['words_played_before_clause_gate'] is not None]
        hold = [r['hold_needed_ms'] for r in rs]; W = sum(r['words'] for r in rs) or 1
        out.append({'vantage': k[0], 'model': k[1], 'responses': len(rs), 'words': W,
                    'share_first_tx_after_first_audio': round(sum(1 for x in ft if x > 0) / len(ft), 3) if ft else None,
                    'first_tx_minus_first_audio_p50_ms': round(pct(ft, .5), 1) if ft else None, 'first_tx_minus_first_audio_p90_ms': round(pct(ft, .9), 1) if ft else None,
                    'clause_gate_audio_played_p50_ms': round(pct(cl, .5), 1) if cl else None, 'clause_gate_audio_played_p90_ms': round(pct(cl, .9), 1) if cl else None,
                    'clause_gate_words_played_p50': round(pct(wc, .5), 2) if wc else None, 'clause_gate_words_played_p90': round(pct(wc, .9), 2) if wc else None,
                    'hold_needed_p50_ms': round(pct(hold, .5), 1), 'hold_needed_p90_ms': round(pct(hold, .9), 1), 'hold_needed_max_ms': round(max(hold), 1),
                    'share_words_late_hold0': round(sum(r['words_late_hold0'] for r in rs) / W, 3),
                    'share_words_late_hold200': round(sum(r['words_late_hold200'] for r in rs) / W, 3),
                    'share_words_late_hold500': round(sum(r['words_late_hold500'] for r in rs) / W, 3),
                    'responses_with_late_words_hold0': round(sum(1 for r in rs if r['words_late_hold0'] > 0) / len(rs), 3)})
    return out

def write(name, rows):
    if not rows: return
    keys = list(rows[0].keys())
    for r in rows:
        for k in r:
            if k not in keys: keys.append(k)
    with open(os.path.join(RES, name), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=keys); w.writeheader()
        for r in rows: w.writerow(r)
    print('wrote', name, len(rows))

if __name__ == '__main__':
    calls = load_calls(sys.argv[1:])
    cal = os.path.join(RES, 'transcript_token_calibration.json')
    TX_TOK_PER_CHAR = json.load(open(cal))['tokens_per_char'] if os.path.exists(cal) else 0.5
    print('calls', len(calls), 'tx tok/char', TX_TOK_PER_CHAR)
    crow, growth = cost_tables(calls)
    write('calls_cost.csv', crow); write('token_growth.csv', growth)
    trows = turn_rows(calls); write('turns.csv', trows)
    write('latency_summary.csv', latency_summary(trows)); write('latency_by_script.csv', latency_summary(trows, True))
    write('cutins.csv', cutin_summary(trows))
    g = gate_rows(calls); write('gate_lag_responses.csv', g); write('gate_lag_summary.csv', gate_summary(g))
