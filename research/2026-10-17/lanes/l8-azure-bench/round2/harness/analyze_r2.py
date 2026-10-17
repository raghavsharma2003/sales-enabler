# r2-latency-india (2026-10-17): summaries, bootstrap CIs and cost per minute from the India-VM result CSVs.
# Usage: python3 analyze_r2.py RESULTS_DIR   (writes *_summary.csv next to the inputs and prints markdown tables)
import csv, sys, os, json, random, statistics as st, math, collections
D = sys.argv[1]; FX = 95.0
def rd(p): return list(csv.DictReader(open(os.path.join(D, p), encoding='utf-8'))) if os.path.exists(os.path.join(D, p)) else []
def f(x):
  try: return float(x)
  except Exception: return None
def pct(v, p):
  v = sorted(v); 
  if not v: return None
  k = (len(v) - 1) * p; lo = math.floor(k); hi = math.ceil(k); return v[lo] + (v[hi] - v[lo]) * (k - lo)
def boot(v, p=0.5, B=4000, seed=7):
  if len(v) < 3: return (None, None)
  r = random.Random(seed); m = sorted(pct([r.choice(v) for _ in v], p) for _ in range(B)); return m[int(.025 * B)], m[int(.975 * B)]
def cboot(groups, p=0.5, B=4000, seed=11):   # cluster bootstrap: resample clusters (sessions)
  keys = list(groups); r = random.Random(seed)
  if len(keys) < 3: return (None, None)
  m = []
  for _ in range(B):
    s = []
    for _ in keys: s += groups[r.choice(keys)]
    m.append(pct(s, p))
  m.sort(); return m[int(.025 * B)], m[int(.975 * B)]
def wilson(k, n, z=1.96):
  if n == 0: return (None, None)
  ph = k / n; den = 1 + z * z / n; c = ph + z * z / (2 * n); a = z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)); return ((c - a) / den, (c + a) / den)
def fmt(x, d=0): return '' if x is None else f'{x:.{d}f}'
def write(name, rows):
  if not rows: return
  with open(os.path.join(D, name), 'w', newline='', encoding='utf-8') as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
def md(rows, cols):
  print('| ' + ' | '.join(cols) + ' |'); print('|' + '---|' * len(cols))
  for r in rows: print('| ' + ' | '.join(str(r.get(c, '')) for c in cols) + ' |')
  print()

# ---------- network
net = rd('netprobe.csv'); out = []
for tgt in dict.fromkeys(r['target'] for r in net):
  c = [r for r in net if r['target'] == tgt and r['arm'] == 'cold' and f(r.get('tcp_ms'))]; w = [f(r['total_ms']) for r in net if r['target'] == tgt and r['arm'] == 'warm']
  out.append({'target': tgt, 'host': c[0]['host'] if c else '', 'n_cold': len(c), 'tcp_connect_p50_ms': fmt(pct([f(r['tcp_ms']) for r in c], .5), 1), 'tls_handshake_p50_ms': fmt(pct([f(r['tls_ms']) for r in c], .5), 1),
              'cold_request_total_p50_ms': fmt(pct([f(r['total_ms']) for r in c], .5), 1), 'n_warm': len(w), 'warm_request_p50_ms': fmt(pct(w, .5), 1), 'warm_request_p90_ms': fmt(pct(w, .9), 1)})
write('netprobe_summary.csv', out); print('## network'); md(out, list(out[0].keys())) if out else None

# ---------- LLM
llm = rd('llm_india.csv'); out = []
for arm in dict.fromkeys(r['arm'] for r in llm):
  rs = [r for r in llm if r['arm'] == arm and f(r['ttft_ms'])]; t = [f(r['ttft_ms']) for r in rs]
  lo, hi = boot(t); lo9, hi9 = boot(t, .9)
  out.append({'arm': arm, 'scope': rs[0]['scope'] if rs else '', 'served_region': ';'.join(sorted(set(r['x_ms_region'] for r in rs))), 'n': len(t),
              'ttft_p50_ms': fmt(pct(t, .5)), 'ttft_p50_ci95': f'{fmt(lo)}-{fmt(hi)}', 'ttft_p90_ms': fmt(pct(t, .9)), 'ttft_p90_ci95': f'{fmt(lo9)}-{fmt(hi9)}',
              'total_p50_ms': fmt(pct([f(r['total_ms']) for r in rs], .5)), 'cached_share': fmt(st.mean([f(r['cached_tokens'] or 0) / f(r['prompt_tokens']) for r in rs if f(r['prompt_tokens'])]), 2),
              'service_tier': ';'.join(sorted(set(r['service_tier'] for r in rs))), 'first_ts': min(r['ts'] for r in rs) if rs else '', 'last_ts': max(r['ts'] for r in rs) if rs else ''})
out.sort(key=lambda r: float(r['ttft_p50_ms'] or 9e9)); write('llm_india_summary.csv', out); print('## LLM TTFT from Central India'); md(out, ['arm', 'scope', 'served_region', 'n', 'ttft_p50_ms', 'ttft_p50_ci95', 'ttft_p90_ms', 'cached_share', 'service_tier'])

# ---------- TTS
tts = rd('tts_india.csv'); out = []
for k in dict.fromkeys((r['region'], r['voice'], r['format']) for r in tts):
  rs = [r for r in tts if (r['region'], r['voice'], r['format']) == k and f(r['ttfb_ms'])]; t = [f(r['ttfb_ms']) for r in rs]; lo, hi = boot(t)
  out.append({'region': k[0], 'voice': k[1], 'format': k[2], 'n': len(t), 'ttfb_p50_ms': fmt(pct(t, .5)), 'ttfb_p50_ci95': f'{fmt(lo)}-{fmt(hi)}', 'ttfb_p90_ms': fmt(pct(t, .9)),
              'chars_mean': fmt(st.mean([f(r['chars']) for r in rs]), 0) if rs else '', 'errors': sum(1 for r in tts if (r['region'], r['voice'], r['format']) == k and r['ok'] != 'True')})
write('tts_india_summary.csv', out); print('## TTS first audio from Central India'); md(out, list(out[0].keys())) if out else None

# ---------- STT
stt = rd('stt_india.csv'); out = []
for k in dict.fromkeys((r['region'], r['seg']) for r in stt):
  rs = [r for r in stt if (r['region'], r['seg']) == k]; t = [f(r['final_after_end_ms']) for r in rs if f(r['final_after_end_ms']) is not None]; lo, hi = boot(t)
  split = sum(1 for r in rs if int(r['n_finals_during_speech'] or 0) > 0); p4 = [r for r in rs if r['persona'] == 'P4']
  out.append({'region': k[0], 'segmentation': k[1], 'n_clips': len(rs), 'final_after_speech_end_p50_ms': fmt(pct(t, .5)), 'p50_ci95': f'{fmt(lo)}-{fmt(hi)}', 'p90_ms': fmt(pct(t, .9)),
              'first_partial_after_speech_start_p50_ms': fmt(pct([f(r['first_partial_after_speech_start_ms']) for r in rs if f(r['first_partial_after_speech_start_ms'])], .5)),
              'clips_with_final_mid_turn': f'{split}/{len(rs)}', 'elderly_P4_with_final_mid_turn': f"{sum(1 for r in p4 if int(r['n_finals_during_speech'] or 0) > 0)}/{len(p4)}",
              'no_final_after_end': sum(1 for r in rs if f(r['final_after_end_ms']) is None)})
write('stt_india_summary.csv', out); print('## STT endpointing from Central India (phone band, hi-IN)'); md(out, list(out[0].keys())) if out else None

# ---------- cascade
def cascade(T, R, tag):
  PRICE = {  # USD per 1M tokens: input, cached input, output  (Azure Retail Prices API 2026-10-17; DZ = global x1.1 per round 1)
    'sin-std gpt-4.1-mini': (0.44, 0.11, 1.76), 'frc-dzeu gpt-6-sol': (2.2, 0.22, 11.0), 'sea-gs gpt-5.4-nano': (0.20, 0.02, 1.25), 'frc-dzeu gpt-6-luna': (0.11, 0.011, 0.55)}
  STT_USD_MIN = 1.0 / 60; TTS_USD_CHAR = 15.0 / 1e6
  out = []; cost_rows = []
  for cfg in dict.fromkeys(r['config'] for r in T):
    main = [r for r in T if r['config'] == cfg and not r['session'].startswith('P4pause')]
    pause = [r for r in T if r['config'] == cfg and r['clip'] == 'P4_t03']
    lat = [f(r['latency_ms']) for r in main if f(r['latency_ms']) is not None]
    clean = [f(r['latency_ms']) for r in main if f(r['latency_ms']) is not None and r['turn_type'] in ('say', 'short')]
    groups = collections.defaultdict(list)
    for r in main:
      if f(r['latency_ms']) is not None: groups[r['session']].append(f(r['latency_ms']))
    lo, hi = boot(lat); clo, chi = cboot(groups); lo9, hi9 = boot(lat, .9); klo, khi = boot(clean)
    le15 = sum(1 for x in lat if x <= 1500); wl = wilson(le15, len(lat))
    cut = sum(1 for r in main if int(r['n_cutins'] or 0) > 0); cw = wilson(cut, len(main))
    pc = sum(1 for r in pause if int(r['n_cutins'] or 0) > 0); pw = wilson(pc, len(pause))
    rr = [x for x in R if x['config'] == cfg and not x['session'].startswith('P4pause')]
    used = [x for x in rr if x['used'] == 'True']; wasted = [x for x in rr if x['used'] != 'True']
    llm = main[0]['llm'] if main else ''
    p_in, p_c, p_out = PRICE.get(llm, (0, 0, 0))
    def usd(x, fallback):
      pt = f(x['prompt_tokens']) or fallback[0]; ct = f(x['cached_tokens']) if f(x['prompt_tokens']) else fallback[1]; co = f(x['completion_tokens']) or (fallback[2] if x['kind'] else 0)
      ct = ct or 0; return ((pt - ct) * p_in + ct * p_c + co * p_out) / 1e6
    fb = (pct([f(x['prompt_tokens']) for x in used if f(x['prompt_tokens'])], .5) or 1800, pct([f(x['cached_tokens']) for x in used if f(x['prompt_tokens'])], .5) or 0, pct([f(x['completion_tokens']) for x in used if f(x['completion_tokens'])], .5) or 30)
    nturn = len(main) or 1
    llm_usd_turn = sum(usd(x, fb) for x in rr) / nturn; tts_usd_turn = sum((f(x['tts_chars']) or 0) for x in rr) * TTS_USD_CHAR / nturn
    for tpm in (3, 3.5, 5, 8):
      cost_rows.append({'config': cfg, 'llm': llm, 'turns_per_min': tpm, 'stt_inr_min': round(STT_USD_MIN * FX, 3), 'llm_inr_min': round(llm_usd_turn * tpm * FX, 3), 'tts_inr_min': round(tts_usd_turn * tpm * FX, 3),
                        'ai_total_inr_min': round((STT_USD_MIN + (llm_usd_turn + tts_usd_turn) * tpm) * FX, 3)})
    out.append({'config': cfg, 'llm': llm, 'seg_ms': main[0]['seg_ms'] if main else '', 'speculative': main[0]['spec'] if main else '', 'turns': len(main), 'turns_with_response': len(lat),
                'p50_ms': fmt(pct(lat, .5)), 'p50_ci95_turn': f'{fmt(lo)}-{fmt(hi)}', 'p50_ci95_session_cluster': f'{fmt(clo)}-{fmt(chi)}', 'p90_ms': fmt(pct(lat, .9)), 'p90_ci95': f'{fmt(lo9)}-{fmt(hi9)}',
                'clean_turn_n': len(clean), 'clean_p50_ms': fmt(pct(clean, .5)), 'clean_p50_ci95': f'{fmt(klo)}-{fmt(khi)}', 'clean_p90_ms': fmt(pct(clean, .9)),
                'share_le_1500ms': f'{le15}/{len(lat)} ({fmt(100 * le15 / max(1, len(lat)))}%, CI {fmt(100 * (wl[0] or 0))}-{fmt(100 * (wl[1] or 0))}%)',
                'turns_with_premature_cutin': f'{cut}/{len(main)} ({fmt(100 * cut / max(1, len(main)))}%, CI {fmt(100 * (cw[0] or 0))}-{fmt(100 * (cw[1] or 0))}%)',
                'elderly_pause_clip_cutin': f'{pc}/{len(pause)} ({fmt(100 * pc / max(1, len(pause)))}%, CI {fmt(100 * (pw[0] or 0))}-{fmt(100 * (pw[1] or 0))}%)',
                'stt_final_rel_end_p50_ms': fmt(pct([f(r['stt_last_final_rel_end_ms']) for r in main if f(r['stt_last_final_rel_end_ms']) is not None], .5)),
                'llm_ttft_p50_ms': fmt(pct([f(r['llm_ttft_ms']) for r in main if f(r['llm_ttft_ms'])], .5)), 'llm_ttft_p90_ms': fmt(pct([f(r['llm_ttft_ms']) for r in main if f(r['llm_ttft_ms'])], .9)),
                'tts_ttfb_p50_ms': fmt(pct([f(r['tts_ttfb_ms']) for r in main if f(r['tts_ttfb_ms'])], .5)), 'gate_us_p50': fmt(pct([f(r['gate_us']) for r in main if f(r['gate_us'])], .5), 1),
                'spec_hit_turns': sum(1 for r in main if int(r['spec_hits'] or 0) > 0), 'responses_per_turn': fmt(len(rr) / nturn, 2), 'wasted_responses_per_turn': fmt(len(wasted) / nturn, 2),
                'gate_substitutions': sum(1 for r in main if r['gate_fail'] not in ('', '[]')), 'ai_inr_per_min_at_5_turns': next(c['ai_total_inr_min'] for c in cost_rows if c['config'] == cfg and c['turns_per_min'] == 5)})
  write(f'cascade_{tag}_summary.csv', out); write(f'cascade_{tag}_cost_per_min.csv', cost_rows)
  print(f'## Cascade {tag}: end of caller speech -> first agent audio byte (Central India VM, no telephone leg)')
  md(out, ['config', 'llm', 'turns', 'turns_with_response', 'p50_ms', 'p50_ci95_turn', 'p50_ci95_session_cluster', 'p90_ms', 'clean_p50_ms', 'clean_p90_ms', 'share_le_1500ms'])
  md(out, ['config', 'turns_with_premature_cutin', 'elderly_pause_clip_cutin', 'stt_final_rel_end_p50_ms', 'llm_ttft_p50_ms', 'tts_ttfb_p50_ms', 'gate_us_p50', 'responses_per_turn', 'wasted_responses_per_turn', 'gate_substitutions', 'ai_inr_per_min_at_5_turns'])
  # paired differences on identical (clip, pass)
  key = lambda r: (r['clip'], r['pass_'])
  by = {cfg: {key(r): f(r['latency_ms']) for r in T if r['config'] == cfg and not r['session'].startswith('P4pause') and f(r['latency_ms']) is not None} for cfg in dict.fromkeys(r['config'] for r in T)}
  pairs = []
  cfgs = list(by)
  for i, a in enumerate(cfgs):
    for b in cfgs[i + 1:]:
      common = sorted(set(by[a]) & set(by[b])); d = [by[b][k] - by[a][k] for k in common]
      if len(d) >= 5: lo, hi = boot(d); pairs.append({'a': a, 'b': b, 'n_pairs': len(d), 'median_b_minus_a_ms': fmt(pct(d, .5)), 'ci95': f'{fmt(lo)}-{fmt(hi)}'})
  write(f'cascade_{tag}_paired.csv', pairs); print('## paired differences'); md(pairs, ['a', 'b', 'n_pairs', 'median_b_minus_a_ms', 'ci95']) if pairs else None


import glob
def cat(pattern):
  out = []
  for fn in sorted(glob.glob(os.path.join(D, pattern))): out += list(csv.DictReader(open(fn, encoding='utf-8')))
  return out
T1, R1 = rd('cascade_v1_turns.csv'), rd('cascade_v1_resp.csv')
if T1: cascade(T1, R1, 'v1')
T2, R2 = cat('cascade_main_turns_s*.csv'), cat('cascade_main_resp_s*.csv')
if T2: cascade(T2, R2, 'main')
T3, R3 = cat('cascade_v2rl429_turns_s*.csv'), cat('cascade_v2rl429_resp_s*.csv')
if T3: cascade(T3, R3, 'ratelimited')


# ---------- cut-ins by the clip's longest internal pause (what the caller did, not what the agent did)
AUD = os.environ.get('AUDIO8K', '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/r2lat/bundle/audio8k')
def gap_class(clip):
  try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from vadutil import load, gaps
    a, sr = load(os.path.join(AUD, clip + '.wav')); g = max([x[1] for x in gaps(a, sr)], default=0)
  except Exception: return 'unknown', None
  return ('no pause >=0.5 s' if g < 500 else 'pause 0.5-0.9 s' if g < 900 else 'pause 0.9-1.3 s' if g < 1300 else 'pause >=2 s'), g
def cutin_table(T, tag):
  rows = []
  gc = {}
  for r in T: gc.setdefault(r['clip'], gap_class(r['clip']))
  for cfg in dict.fromkeys(r['config'] for r in T):
    for cls in ('no pause >=0.5 s', 'pause 0.5-0.9 s', 'pause 0.9-1.3 s', 'pause >=2 s'):
      rs = [r for r in T if r['config'] == cfg and gc[r['clip']][0] == cls]
      if not rs: continue
      k = sum(1 for r in rs if int(r['n_cutins'] or 0) > 0); lo, hi = wilson(k, len(rs))
      rows.append({'config': cfg, 'clip_longest_pause': cls, 'turns': len(rs), 'turns_with_cutin': k, 'share': f'{100 * k / len(rs):.0f}% (CI {max(0, 100 * lo):.0f}-{100 * hi:.0f}%)'})
  write(f'cascade_{tag}_cutins_by_pause.csv', rows); print(f'## cut-ins by longest caller pause ({tag})'); md(rows, ['config', 'clip_longest_pause', 'turns', 'turns_with_cutin', 'share'])
  gl = [{'clip': c, 'longest_pause_ms': v[1], 'class': v[0]} for c, v in sorted(gc.items())]
  write('clip_pauses.csv', gl)
if T2: cutin_table(T2, 'main')

# ---------- Voice Live
import glob as _g
V = [r for fn in sorted(_g.glob(os.path.join(D, 'voicelive_india_[a-d].csv'))) for r in csv.DictReader(open(fn, encoding='utf-8'))]; out = []
for arm in dict.fromkeys(r['arm'] for r in V):
  rs = [r for r in V if r['arm'] == arm and r.get('clip')]
  key_ = 'gated_first_audio_rel_end_ms' if arm == 'vl-text-gated' else 'first_audio_rel_end_ms'
  t = [f(r[key_]) for r in rs if f(r[key_]) is not None]; lo, hi = boot(t)
  out.append({'arm': arm, 'turns': len(rs), 'turns_with_audio': len(t), 'first_audio_p50_ms': fmt(pct(t, .5)), 'p50_ci95': f'{fmt(lo)}-{fmt(hi)}', 'p90_ms': fmt(pct(t, .9)),
              'first_text_p50_ms': fmt(pct([f(r['first_text_rel_end_ms']) for r in rs if f(r['first_text_rel_end_ms']) is not None], .5)),
              'vad_stop_p50_ms': fmt(pct([f(r['vad_stop_rel_end_ms']) for r in rs if f(r['vad_stop_rel_end_ms']) is not None], .5)),
              'turns_with_audio_cutin': sum(1 for r in rs if int(r['n_cutins_audio_before_end'] or 0) > 0), 'session_updated_p50_ms': fmt(pct([f(r['session_updated_ms']) for r in rs if f(r['session_updated_ms'])], .5)),
              'errors': ';'.join(sorted(set(r['err'][:80] for r in V if r['arm'] == arm and r['err'])))})
write('voicelive_india_summary.csv', out); print('## Voice Live (Central India resource, from Central India VM)'); md(out, list(out[0].keys())) if out else None
