# g3-cascade-measured (2026-10-18): summaries, bootstrap CIs and cost per connected minute from the India-VM CSVs.
# Usage: python3 analyze.py RAW_DIR AUDIO8K_DIR OUT_RESULTS_DIR
# Latency: caller end of speech -> first agent audio byte (Central India VM, no telephone leg), per configuration.
# Cost: measured per-exchange usage (tokens, characters, audio seconds) x PAID list prices (cost_inputs below, each
# with its source and read date), for 1/3/5/10-minute calls, at the measured exchange rate and at 3 and 8 per minute.
import csv, sys, os, json, random, statistics as st, math, collections, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vadutil import load, gaps
RAW, AUD, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
FX = 95.0
random.seed(20261018)
def f(x):
  try: return float(x)
  except Exception: return None
def pct(v, q):
  v = sorted(x for x in v if x is not None)
  if not v: return None
  k = (len(v) - 1) * q; lo = int(k); hi = min(lo + 1, len(v) - 1); return v[lo] + (v[hi] - v[lo]) * (k - lo)
def boot(v, q=.5, n=2000):
  v = [x for x in v if x is not None]
  if len(v) < 3: return (None, None)
  s = sorted(pct([random.choice(v) for _ in v], q) for _ in range(n)); return s[int(.025 * n)], s[int(.975 * n)]
def boot_cluster(rows, key, q=.5, n=2000):
  cl = collections.defaultdict(list)
  for r in rows:
    if f(r['latency_ms']) is not None: cl[r[key]].append(f(r['latency_ms']))
  ks = list(cl)
  if len(ks) < 2: return (None, None)
  s = sorted(pct([x for k in (random.choice(ks) for _ in ks) for x in cl[k]], q) for _ in range(n)); return s[int(.025 * n)], s[int(.975 * n)]
def r0(x): return None if x is None else round(x)
def write(name, rows):
  if not rows: return
  keys = list(dict.fromkeys(k for r in rows for k in r))
  with open(os.path.join(OUT, name), 'w', newline='', encoding='utf-8') as fh:
    w = csv.DictWriter(fh, fieldnames=keys); w.writeheader(); [w.writerow(r) for r in rows]
def md(rows, cols):
  print('| ' + ' | '.join(cols) + ' |'); print('|' + '---|' * len(cols))
  for r in rows: print('| ' + ' | '.join('' if r.get(c) is None else str(r.get(c)) for c in cols) + ' |')
  print()
def rd(path): return list(csv.DictReader(open(path, encoding='utf-8'))) if os.path.exists(path) else []

# ---------- clip facts (internal pauses, duration) ----------
CLIP = {}
for fn in os.listdir(AUD):
  if not fn.endswith('.wav'): continue
  a, sr = load(os.path.join(AUD, fn)); g = gaps(a, sr, 500)
  CLIP[fn[:-4]] = {'dur_s': len(a) / sr, 'max_gap_ms': max([x[1] for x in g] or [0]), 'n_gaps_500': len(g)}

# ---------- PRICES (paid list; USD) ----------
PRICES = {
  # LLM: (input, cached_input, output) per 1M tokens
  'az:g3-gpt-4-1-mini-std': (0.44, 0.11, 1.76, 'Azure Retail Prices API, southindia, "gpt 4.1 mini Inp/cached Inp/Outp regnl", read 2026-10-18'),
  'gm:gemini-3.5-flash-lite': (0.30, 0.03, 2.50, 'ai.google.dev/gemini-api/docs/pricing via g1 prices.json (standard tier), read 2026-10-18'),
  'gm:gemini-3.1-flash-lite': (0.25, 0.025, 1.50, 'g1 prices.json (standard tier), read 2026-10-18'),
  'or:openai/gpt-oss-120b@groq': (0.15, 0.075, 0.60, 'openrouter.ai/api/v1/models/openai/gpt-oss-120b/endpoints (Groq), read 2026-10-18; cached = model-level input_cache_read'),
  'or:google/gemini-3.1-flash-lite@google-ai-studio': (0.25, 0.025, 1.50, 'OpenRouter endpoints (Google AI Studio), read 2026-10-18'),
  'or:meta-llama/llama-3.3-70b-instruct@groq': (0.59, 0.59, 0.79, 'OpenRouter endpoints (Groq), read 2026-10-18; no cache price listed'),
}
STT_AZ_USD_H = 1.00          # S1 Speech To Text, centralindia, Retail API 2026-10-18
STT_AZ_COMMIT_USD_H = {'2K h/mo': 0.80, '10K h/mo': 0.65, '50K h/mo': 0.50, '100K h/mo': 0.40}
GTL_AUDIO_USD_1M, GTL_TEXT_USD_1M, GTL_TOK_S = 3.5, 21.0, 25
GTL_TEXT_TOK_UTT = 14.6   # countTokens (gemini-3.5-flash-lite) on the 30 P1/P2/P4 battery transcripts: 439 tokens, 2026-10-18   # gemini-3.5-transcribe-live (g1 prices.json; 25 audio tok/s)
TTS_AZ = {'neural': 15.0, 'hd': 22.0}   # per 1M chars, centralindia Retail API 2026-10-18
GEM_TTS = {'gemini-3.8-flash-lite-tts': (0.50, 6.0, 1.00, 12.0), 'gemini-3.8-flash-tts': (0.50, 9.0, 1.00, 18.0)}  # (text in, audio out) to 2026-12-31, then from 2027-01-01
def tts_family(tts):
  if tts.startswith('az:'): return 'hd' if ('DragonHD' in tts or 'MAI-Voice' in tts) else 'neural'
  return tts.split(':')[1]

# ---------- cascade turns ----------
T = []; Rr = []
for p in sorted(glob.glob(os.path.join(RAW, 'casc_turns_*.csv'))):
  tag = os.path.basename(p)[len('casc_turns_'):-4]; tr = rd(p); rr = rd(os.path.join(RAW, f'casc_resp_{tag}.csv'))
  if tag.endswith('g'):   # VAD-gated STT validation runs (STT_GATE=1)
    for r in tr + rr: r['config'] = r['config'] + '+gatedSTT'
  T += tr; Rr += rr
summ = []; cost_rows = []; usage_rows = []
for cfg in dict.fromkeys(r['config'] for r in T):
  rows = [r for r in T if r['config'] == cfg]
  main = [r for r in rows if not r['session'].startswith('P4pause')]
  pause = [r for r in rows if r['session'].startswith('P4pause')]
  lat = [f(r['latency_ms']) for r in main if f(r['latency_ms']) is not None]
  clean = [r for r in main if CLIP.get(r['clip'], {}).get('max_gap_ms', 0) < 500]
  gapt = [r for r in main if CLIP.get(r['clip'], {}).get('max_gap_ms', 0) >= 500]
  clat = [f(r['latency_ms']) for r in clean if f(r['latency_ms']) is not None]
  lo, hi = boot(lat); clo, chi = boot_cluster(main, 'session'); lo9, hi9 = boot(lat, .9)
  clo_c, chi_c = boot(clat)
  resp = [x for x in Rr if x['config'] == cfg]
  rb = collections.defaultdict(list)
  for x in resp: rb[(x['session'], x['clip'])].append(x)
  s0 = rows[0]
  rec = {'config': cfg, 'stt': s0['stt'], 'llm': s0['llm'], 'tts': s0['tts'], 'turns': len(main), 'turns_answered': len(lat),
         'p50_ms': r0(pct(lat, .5)), 'p50_ci95': f'{r0(lo)}-{r0(hi)}', 'p50_ci95_session_cluster': f'{r0(clo)}-{r0(chi)}', 'p90_ms': r0(pct(lat, .9)), 'p90_ci95': f'{r0(lo9)}-{r0(hi9)}',
         'share_le_1200': round(sum(1 for x in lat if x <= 1200) / len(lat), 2) if lat else None, 'share_le_1500': round(sum(1 for x in lat if x <= 1500) / len(lat), 2) if lat else None,
         'clean_turns': len(clean), 'clean_p50_ms': r0(pct(clat, .5)), 'clean_p50_ci95': f'{r0(clo_c)}-{r0(chi_c)}', 'clean_p90_ms': r0(pct(clat, .9)),
         'stt_final_rel_end_p50_ms': r0(pct([f(r['stt_last_final_rel_end_ms']) for r in main], .5)), 'llm_ttft_p50_ms': r0(pct([f(r['llm_ttft_ms']) for r in main], .5)),
         'first_clause_rel_end_p50_ms': r0(pct([f(r['first_clause_rel_end_ms']) for r in main], .5)), 'llm_done_rel_end_p50_ms': r0(pct([f(r['llm_done_rel_end_ms']) for r in main], .5)),
         'tts_ttfb_p50_ms': r0(pct([f(r['tts_ttfb_ms']) for r in main], .5)), 'tts_ttfb_p90_ms': r0(pct([f(r['tts_ttfb_ms']) for r in main], .9)),
         'cutin_turns_main': f"{sum(1 for r in main if int(r['n_cutins'] or 0) > 0)}/{len(main)}",
         'cutin_rate_main': round(sum(1 for r in main if int(r['n_cutins'] or 0) > 0) / len(main), 3) if main else None,
         'cutin_gap_turns': f"{sum(1 for r in gapt if int(r['n_cutins'] or 0) > 0)}/{len(gapt)}", 'cutin_clean_turns': f"{sum(1 for r in clean if int(r['n_cutins'] or 0) > 0)}/{len(clean)}",
         'elderly_pause_cutin': f"{sum(1 for r in pause if int(r['n_cutins'] or 0) > 0)}/{len(pause)}",
         'elderly_pause_answered_after_end': f"{sum(1 for r in pause if f(r['latency_ms']) is not None)}/{len(pause)}",
         'responses_per_turn': round(st.mean(int(r['n_resps'] or 0) for r in main), 2) if main else None,
         'turns_with_errors': sum(1 for r in main if r['resp_errs'] or r['errs']), 'gate_substitutions': sum(1 for r in main if r['gate_fail'] not in ('', '[]'))}
  # by persona
  for p in ('P1', 'P2', 'P4'):
    pl = [f(r['latency_ms']) for r in main if r['persona'] == p and f(r['latency_ms']) is not None]
    rec[f'{p}_p50_ms'] = r0(pct(pl, .5))
  summ.append(rec)
  # ---------- usage per exchange (main turns; all responses in the turn, wasted ones included) ----------
  ex = []
  med_used_p = st.median([f(x['prompt_tokens']) for x in resp if x['used'] == 'True' and f(x['prompt_tokens'])] or [0])
  n_imputed = 0
  for r in main:
    rs = rb.get((r['session'], r['clip']), [])
    used = [x for x in rs if x['used'] == 'True']
    used_p0 = f(used[0]['prompt_tokens']) if used and f(used[0]['prompt_tokens']) else med_used_p
    # a stream cancelled before its final chunk reports no usage, but its prompt was sent and is billed: impute the
    # turn's used prompt (or the config median); its few completion tokens are not imputed (lower bound)
    imp = [x for x in rs if x.get('llm_status') == '200' and not f(x['prompt_tokens'])]; n_imputed += len(imp)
    ptok_meas = sum(int(f(x['prompt_tokens']) or 0) for x in rs); ctok = sum(int(f(x['cached_tokens']) or 0) for x in rs)
    ptok = ptok_meas + len(imp) * used_p0
    ctok = ctok + (len(imp) * used_p0 * (ctok / ptok_meas) if ptok_meas else 0)
    otok = sum(int(f(x['completion_tokens']) or 0) for x in rs)
    ttok = sum(int(f(x['thought_tokens']) or 0) for x in rs)
    chars = sum(int(f(x['tts_chars']) or 0) for x in rs)
    g_in = sum(int(f(x['tts_in_tokens']) or 0) for x in rs); g_out = sum(int(f(x['tts_out_tokens']) or 0) for x in rs)
    if r['tts'].startswith('az:'): agent_s = sum((f(x['audio_bytes']) or 0) for x in used) / 8000
    else: agent_s = sum((f(x['tts_audio_s']) or 0) for x in used)
    orc = sum(f(x['or_cost_usd']) or 0 for x in rs)
    used_p = int(f(used[0]['prompt_tokens']) or 0) if used else None
    k = int(r['clip'][4:6]) if r['clip'][4:6].isdigit() else None
    ex.append({'ptok': ptok, 'ctok': ctok, 'otok': otok, 'ttok': ttok, 'chars': chars, 'g_in': g_in, 'g_out': g_out, 'agent_s': agent_s, 'caller_s': CLIP.get(r['clip'], {}).get('dur_s', 0),
               'lat_s': (f(r['latency_ms']) or 0) / 1e3, 'or_cost': orc, 'used_p': used_p, 'idx': k})
  if not ex: continue
  n = len(ex); m = lambda key: sum(e[key] for e in ex) / n
  sent = []; prev = {}
  for r in main:
    v = f(r.get('stt_audio_sent_s_cum')); w = f(r.get('session_wall_s_cum'))
    if v is None: continue
    sent.append(v - prev.get(r['session'], 0.0)); prev[r['session']] = v
  sent_per_ex = st.mean(sent) if sent else None
  # prompt growth per exchange from used responses (history re-sent each turn): slope of used prompt vs position in session
  pts = [(e['idx'], e['used_p']) for e in ex if e['used_p'] and e['idx']]
  if len(pts) > 3:
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; mx = st.mean(xs); my = st.mean(ys)
    slope = sum((a - mx) * (b - my) for a, b in pts) / max(1e-9, sum((a - mx) ** 2 for a in xs)); base = my - slope * mx
  else: slope, base = 0, m('ptok')
  waste = (m('ptok') / st.mean(e['used_p'] for e in ex if e['used_p'])) if any(e['used_p'] for e in ex) else 1
  cached_share = (m('ctok') / m('ptok')) if m('ptok') else 0
  ex_s = m('caller_s') + m('lat_s') + m('agent_s'); epm = 60 / ex_s if ex_s else 5
  agent_share = m('agent_s') / ex_s if ex_s else .4; caller_share = m('caller_s') / ex_s if ex_s else .4
  u = {'config': cfg, 'exchanges_measured': n, 'prompt_tokens_per_exchange_all_resps': round(m('ptok')), 'cached_share': round(cached_share, 3), 'completion_tokens_per_exchange': round(m('otok'), 1),
       'thought_tokens_per_exchange': round(m('ttok'), 1), 'prompt_base_tokens': round(base), 'prompt_growth_tokens_per_exchange': round(slope, 1), 'llm_waste_factor': round(waste, 2),
       'tts_chars_per_exchange': round(m('chars'), 1), 'gem_tts_in_tokens_per_exchange': round(m('g_in'), 1), 'gem_tts_out_tokens_per_exchange': round(m('g_out'), 1),
       'agent_audio_s_per_exchange': round(m('agent_s'), 2), 'caller_audio_s_per_exchange': round(m('caller_s'), 2), 'latency_s_mean': round(m('lat_s'), 2),
       'exchanges_per_min_modelled': round(epm, 2), 'agent_talk_share': round(agent_share, 3), 'caller_talk_share': round(caller_share, 3),
       'or_cost_usd_per_exchange_reported': round(m('or_cost'), 7), 'cancelled_streams_prompt_imputed': n_imputed,
       'stt_audio_sent_s_per_exchange': round(sent_per_ex, 2) if sent_per_ex is not None else None}
  usage_rows.append(u)
  # ---------- cost per connected minute ----------
  llm = s0['llm']; tts = s0['tts']; fam = tts_family(tts)
  pin, pc, pout, psrc = PRICES.get(llm, (None, None, None, 'no price'))
  if pin is None: print('no price for', llm); continue
  chars_per_agent_s = (m('chars') / m('agent_s')) if m('agent_s') else None
  gtok_per_agent_s = (m('g_out') / m('agent_s')) if m('agent_s') else None
  SHAPES = [('battery-measured', epm, m('agent_s') * epm, caller_share), ('ref 5/min, agent 40%', 5.0, 24.0, .40),
            ('ref 3/min, agent 40%', 3.0, 24.0, .40), ('ref 8/min, agent 40%', 8.0, 24.0, .40)]
  for shape, rate, agent_s_min, csh in SHAPES:
    for L in (1, 3, 5, 10):
      N = max(1, round(rate * L))
      llm_usd = 0.0
      for k in range(1, N + 1):   # prompt re-sent every exchange: base + measured growth per exchange, times measured waste factor
        p = (base + slope * (k - 1)) * waste
        llm_usd += (p * (1 - cached_share) * pin + p * cached_share * pc) / 1e6
      llm_usd += N * m('otok') * pout / 1e6
      gated_run = cfg.endswith('+gatedSTT') and sent_per_ex is not None
      if s0['stt'] == 'az' and gated_run:   # measured: billable seconds actually sent per exchange
        stt_usd = N * sent_per_ex * STT_AZ_USD_H / 3600; stt_gated = stt_usd; stt_hi = stt_usd
      elif gated_run:
        stt_usd = N * sent_per_ex * GTL_TOK_S * GTL_AUDIO_USD_1M / 1e6 + N * GTL_TEXT_TOK_UTT * GTL_TEXT_USD_1M / 1e6; stt_gated = stt_usd
        stt_hi = N * sent_per_ex * GTL_TOK_S * GTL_AUDIO_USD_1M / 1e6 + L * 0.004
      elif s0['stt'] == 'az':
        stt_usd = L * STT_AZ_USD_H / 60; stt_gated = L * min(1.0, csh * 1.25) * STT_AZ_USD_H / 60; stt_hi = stt_usd
      else:   # audio tokens for every streamed second + final-transcript text tokens (14.6/utterance, countTokens on the battery); hi = Google's published $0.004/min text
        stt_usd = L * 60 * GTL_TOK_S * GTL_AUDIO_USD_1M / 1e6 + N * GTL_TEXT_TOK_UTT * GTL_TEXT_USD_1M / 1e6
        stt_gated = L * min(1.0, csh * 1.25) * 60 * GTL_TOK_S * GTL_AUDIO_USD_1M / 1e6 + N * GTL_TEXT_TOK_UTT * GTL_TEXT_USD_1M / 1e6
        stt_hi = L * (60 * GTL_TOK_S * GTL_AUDIO_USD_1M / 1e6 + 0.004)
      agent_s_total = agent_s_min * L
      if tts.startswith('az:'):
        tts_usd = agent_s_total * (chars_per_agent_s or 0) * TTS_AZ[fam] / 1e6; tts_usd_2027 = tts_usd
      else:
        a, b, a27, b27 = GEM_TTS[fam]; tin = N * m('g_in'); tout = agent_s_total * (gtok_per_agent_s or 25)
        tts_usd = (tin * a + tout * b) / 1e6; tts_usd_2027 = (tin * a27 + tout * b27) / 1e6
      tot = stt_usd + llm_usd + tts_usd
      cost_rows.append({'config': cfg, 'stt': s0['stt'], 'llm': llm, 'tts': tts, 'shape': shape, 'exchanges_per_min': round(rate, 2), 'agent_s_per_min': round(agent_s_min, 1),
                        'call_min': L, 'exchanges': N, 'stt_inr_per_min': round(stt_usd * FX / L, 3), 'llm_inr_per_min': round(llm_usd * FX / L, 3), 'tts_inr_per_min': round(tts_usd * FX / L, 3),
                        'ai_inr_per_min': round(tot * FX / L, 3), 'ai_inr_per_call': round(tot * FX, 2),
                        'ai_inr_per_min_stt_vad_gated': round((stt_gated + llm_usd + tts_usd) * FX / L, 3),
                        'ai_inr_per_min_stt_upper': round((stt_hi + llm_usd + tts_usd) * FX / L, 3),
                        'ai_inr_per_min_2027_prices': round((stt_usd + llm_usd + tts_usd_2027) * FX / L, 3), 'llm_price_source': psrc})
  u['tts_chars_per_agent_s'] = round(chars_per_agent_s, 2) if chars_per_agent_s else None
  u['gem_tts_tokens_per_agent_s'] = round(gtok_per_agent_s, 2) if gtok_per_agent_s else None
write('cascade_summary.csv', summ); write('cascade_usage_per_exchange.csv', usage_rows); write('cost_per_min.csv', cost_rows)
print('## Cascade: caller end of speech -> first agent audio byte (Central India VM, no telephone leg)')
md(summ, ['config', 'turns', 'turns_answered', 'p50_ms', 'p50_ci95', 'p50_ci95_session_cluster', 'p90_ms', 'share_le_1200', 'clean_turns', 'clean_p50_ms', 'clean_p90_ms'])
md(summ, ['config', 'stt_final_rel_end_p50_ms', 'llm_ttft_p50_ms', 'first_clause_rel_end_p50_ms', 'llm_done_rel_end_p50_ms', 'tts_ttfb_p50_ms', 'tts_ttfb_p90_ms', 'responses_per_turn', 'turns_with_errors'])
md(summ, ['config', 'cutin_turns_main', 'cutin_gap_turns', 'cutin_clean_turns', 'elderly_pause_cutin', 'P1_p50_ms', 'P2_p50_ms', 'P4_p50_ms', 'gate_substitutions'])
md(usage_rows, ['config', 'exchanges_measured', 'prompt_base_tokens', 'prompt_growth_tokens_per_exchange', 'llm_waste_factor', 'cached_share', 'completion_tokens_per_exchange', 'tts_chars_per_exchange', 'gem_tts_out_tokens_per_exchange', 'agent_audio_s_per_exchange', 'exchanges_per_min_modelled', 'tts_chars_per_agent_s', 'gem_tts_tokens_per_agent_s'])
for sh in ('battery-measured', 'ref 5/min, agent 40%'):
  print('### cost shape:', sh); md([c for c in cost_rows if c['shape'] == sh], ['config', 'call_min', 'exchanges', 'stt_inr_per_min', 'llm_inr_per_min', 'tts_inr_per_min', 'ai_inr_per_min', 'ai_inr_per_min_stt_vad_gated', 'ai_inr_per_min_stt_upper', 'ai_inr_per_min_2027_prices', 'ai_inr_per_call'])

# ---------- component benches ----------
L = rd(os.path.join(RAW, 'llm_india.csv'))
if L:
  out = []
  for a in dict.fromkeys(r['arm'] for r in L):
    rs = [r for r in L if r['arm'] == a]; ok = [r for r in rs if r['status'] == '200' and f(r['ttft_ms']) is not None]
    t = [f(r['ttft_ms']) for r in ok]; lo, hi = boot(t)
    errs = collections.Counter((r['status'] or 'none') for r in rs if not (r['status'] == '200' and f(r['ttft_ms']) is not None))
    out.append({'arm': a, 'calls': len(rs), 'ok': len(ok), 'ttft_p50_ms': r0(pct(t, .5)), 'ttft_p50_ci95': f'{r0(lo)}-{r0(hi)}', 'ttft_p90_ms': r0(pct(t, .9)),
                'total_p50_ms': r0(pct([f(r['total_ms']) for r in ok], .5)), 'prompt_tokens_mean': r0(st.mean(f(r['prompt_tokens']) for r in ok)) if ok else None,
                'cached_share': round(sum(f(r['cached_tokens']) or 0 for r in ok) / max(1, sum(f(r['prompt_tokens']) or 0 for r in ok)), 2) if ok else None,
                'completion_tokens_mean': round(st.mean(f(r['completion_tokens']) or 0 for r in ok), 1) if ok else None,
                'or_cost_usd_mean': (round(st.mean(f(r['or_cost_usd']) or 0 for r in ok), 7) if a.startswith('or:') and ok else None), 'failures': dict(errs)})
  out.sort(key=lambda r: (r['ttft_p50_ms'] is None, r['ttft_p50_ms'] or 0))
  write('llm_india_summary.csv', out); print('## LLM streaming TTFT from the Central India VM (warm, ~1.8k-token prompt, n=30 attempted per arm)'); md(out, ['arm', 'calls', 'ok', 'ttft_p50_ms', 'ttft_p50_ci95', 'ttft_p90_ms', 'total_p50_ms', 'cached_share', 'completion_tokens_mean', 'failures'])
TT = rd(os.path.join(RAW, 'tts_india_az.csv')) + rd(os.path.join(RAW, 'tts_india_gem.csv')) + rd(os.path.join(RAW, 'tts_india_gem2.csv'))
if TT:
  out = []
  for (a, k) in dict.fromkeys((r['arm'], r['kind']) for r in TT):
    rs = [r for r in TT if r['arm'] == a and r['kind'] == k]; ok = [r for r in rs if r['status'] == '200' and f(r.get('ttfb_ms')) is not None]
    t = [f(r['ttfb_ms']) for r in ok]; lo, hi = boot(t)
    out.append({'arm': a, 'text': k, 'calls': len(rs), 'ok': len(ok), 'ttfb_p50_ms': r0(pct(t, .5)), 'ttfb_p50_ci95': f'{r0(lo)}-{r0(hi)}', 'ttfb_p90_ms': r0(pct(t, .9)),
                'rtf_p50': (round(pct([f(r.get('rtf')) for r in ok], .5), 3) if any(f(r.get('rtf')) for r in ok) else None),
                'max_underrun_ms': max([f(r.get('max_underrun_ms')) or 0 for r in ok] or [0]), 'failures': dict(collections.Counter(r['status'] for r in rs if r not in ok))})
  write('tts_india_summary.csv', out); print('## TTS time to first audio from the Central India VM'); md(out, ['arm', 'text', 'calls', 'ok', 'ttfb_p50_ms', 'ttfb_p50_ci95', 'ttfb_p90_ms', 'rtf_p50', 'max_underrun_ms', 'failures'])
