# g3-cascade-measured, resumed 2026-10-19 after a container restart: an INDEPENDENT re-derivation of the lane's latency
# and cost results from the raw per-turn / per-response rows pulled back from the (since deleted) Central India VM.
# It does not import analyze.py; it re-implements the metrics, adds p90 cluster CIs, Wilson intervals for cut-in rates,
# per-persona cut-ins, pause timing, an explicit completeness table, COMPUTED composites for the Gemini-TTS cascades that
# could not run end-to-end on the free tier (component sums using g5's paid-tier India TTS first-byte samples), cost per
# connected minute at 1/3/5/10 minutes, and a side-by-side with g5 (Gemini Live, paid tier, India).
#
# Usage: python3 rederive.py RESULTS_DIR AUDIO8K_DIR G5_RESULTS_DIR
# Outputs (into RESULTS_DIR): rederived_*.csv, composite_gemini_tts_*.csv, side_by_side_g5.csv, config_status.csv,
# ai_budget.csv, and a markdown digest on stdout.
import csv, os, sys, json, math, random, statistics as st, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vadutil import load, gaps, speech_frames
import numpy as np

RES, AUD, G5 = sys.argv[1], sys.argv[2], sys.argv[3]
FX = 95.0
SEED = 20261019
NB = 4000

def f(x):
  try:
    v = float(x)
    return None if math.isnan(v) else v
  except Exception: return None
def rd(p): return list(csv.DictReader(open(p, encoding='utf-8'))) if os.path.exists(p) else []
def q(v, p):
  v = sorted(x for x in v if x is not None)
  if not v: return None
  k = (len(v) - 1) * p; lo = int(math.floor(k)); hi = min(lo + 1, len(v) - 1)
  return v[lo] + (v[hi] - v[lo]) * (k - lo)
def r0(x): return None if x is None else int(round(x))
def wilson(k, n, z=1.96):
  if n == 0: return (None, None)
  p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
  return (round(max(0, c - h), 3), round(min(1, c + h), 3))
def boot_turn(v, p, rng):
  v = [x for x in v if x is not None]
  if len(v) < 5: return (None, None)
  s = sorted(q([v[rng.randrange(len(v))] for _ in v], p) for _ in range(NB)); return (s[int(.025 * NB)], s[int(.975 * NB) - 1])
def boot_cluster(groups, p, rng):
  ks = [k for k in groups if groups[k]]
  if len(ks) < 3: return (None, None)
  s = []
  for _ in range(NB):
    pick = [ks[rng.randrange(len(ks))] for _ in ks]
    s.append(q([x for k in pick for x in groups[k]], p))
  s.sort(); return (s[int(.025 * NB)], s[int(.975 * NB) - 1])
def ci(t): return '' if t[0] is None else f'{r0(t[0])}-{r0(t[1])}'
def write(name, rows):
  if not rows: return
  keys = list(dict.fromkeys(k for r in rows for k in r))
  with open(os.path.join(RES, name), 'w', newline='', encoding='utf-8') as fh:
    w = csv.DictWriter(fh, fieldnames=keys); w.writeheader(); [w.writerow(r) for r in rows]
def md(rows, cols, hdr=None):
  print('| ' + ' | '.join(hdr or cols) + ' |'); print('|' + '---|' * len(cols))
  for r in rows: print('| ' + ' | '.join('' if r.get(c) is None else str(r.get(c)) for c in cols) + ' |')
  print()

# ---------------- clip facts from the actual battery audio that was played ----------------
CLIP = {}
for fn in sorted(os.listdir(AUD)):
  if not fn.endswith('.wav'): continue
  a, sr = load(os.path.join(AUD, fn)); spf = speech_frames(a, sr); idx = np.where(spf)[0]
  g = gaps(a, sr, 500)
  CLIP[fn[:-4]] = {'dur_s': len(a) / sr, 'speech_s': (idx[-1] - idx[0] + 1) * 0.02 if len(idx) else 0, 'last_sp_ms': int(idx[-1]) * 20 if len(idx) else 0,
                   'max_gap_ms': max([x[1] for x in g] or [0]), 'gaps': g}
PAUSE = CLIP['P4_t03']; P_START = PAUSE['gaps'][0][0]; P_END = P_START + PAUSE['gaps'][0][1]

# ---------------- configurations (from harness/cascade3.py CONFIGS and the run logs) ----------------
DESC = {
  'C1': ('Azure real-time STT hi-IN (centralindia, 500 ms segmentation)', 'gpt-4.1-mini, Azure South India Standard', 'Azure neural hi-IN-SwaraNeural (centralindia, WS, clause-streamed)'),
  'C2': ('Azure real-time STT hi-IN', 'gpt-4.1-mini, Azure South India Standard', 'Azure DragonHD en-IN-Aarti:DragonHDLatestNeural (centralindia, WS, clause-streamed)'),
  'C3': ('Azure real-time STT hi-IN', 'gpt-oss-120b on Groq via OpenRouter (reasoning low)', 'Azure DragonHD en-IN-Aarti:DragonHDLatestNeural'),
  'C6': ('gemini-3.5-transcribe-live (Live API, free tier, 500 ms hybrid VAD)', 'gpt-oss-120b on Groq via OpenRouter', 'Azure neural hi-IN-SwaraNeural'),
  'C7': ('Azure real-time STT hi-IN', 'gemini-3.5-flash-lite, Gemini API free tier, thinking minimal', 'Azure neural hi-IN-SwaraNeural'),
  'C8': ('gemini-3.5-transcribe-live (free tier)', 'gemini-3.5-flash-lite (free tier)', 'Azure neural hi-IN-SwaraNeural'),
}
TAGS = ['c1', 'c2', 'c3', 'c6', 'c7', 'c8', 'c1g', 'c6g']
T = {}; R = {}
for t in TAGS:
  tr = rd(os.path.join(RES, f'casc_turns_{t}.csv')); rr = rd(os.path.join(RES, f'casc_resp_{t}.csv'))
  name = tr[0]['config'] + ('+gatedSTT' if t.endswith('g') else '')
  T[name] = tr; R[name] = rr

rng = random.Random(SEED)
lat_rows = []; persona_rows = []; pause_rows = []; status_rows = []; comp_rows = []
for cfg, rows in T.items():
  main = [r for r in rows if not r['session'].startswith('P4pause')]
  pause = [r for r in rows if r['session'].startswith('P4pause')]
  lat = [f(r['latency_ms']) for r in main]; ans = [x for x in lat if x is not None]
  groups = collections.defaultdict(list)
  for r in main:
    if f(r['latency_ms']) is not None: groups[r['session']].append(f(r['latency_ms']))
  clean = [r for r in main if CLIP[r['clip']]['max_gap_ms'] < 500]; gapt = [r for r in main if CLIP[r['clip']]['max_gap_ms'] >= 500]
  clat = [f(r['latency_ms']) for r in clean if f(r['latency_ms']) is not None]
  cgroups = collections.defaultdict(list)
  for r in clean:
    if f(r['latency_ms']) is not None: cgroups[r['session']].append(f(r['latency_ms']))
  cut = lambda rs: sum(1 for r in rs if int(r['n_cutins'] or 0) > 0)
  unans = [r for r in main if f(r['latency_ms']) is None]
  why = collections.Counter(('429 free-tier quota' if '429' in (r['resp_errs'] + r['errs']) else ('no STT final (caller audio never transcribed)' if not r['caller_text'].strip() else 'other')) for r in unans)
  rec = {'config': cfg, 'stt': rows[0]['stt'], 'llm': rows[0]['llm'], 'tts': rows[0]['tts'], 'vantage': 'Central India VM (Standard_D4s_v5), no telephone leg',
         'run_utc': f"{rows[0]['ts']}..{rows[-1]['ts']}", 'sessions': len(groups), 'turns': len(main), 'answered': len(ans),
         'p50_ms': r0(q(ans, .5)), 'p50_ci95_turn': ci(boot_turn(ans, .5, rng)), 'p50_ci95_call_cluster': ci(boot_cluster(groups, .5, rng)),
         'p90_ms': r0(q(ans, .9)), 'p90_ci95_call_cluster': ci(boot_cluster(groups, .9, rng)),
         'share_le_1200': round(sum(1 for x in ans if x <= 1200) / len(ans), 3), 'share_le_1500': round(sum(1 for x in ans if x <= 1500) / len(ans), 3),
         'clean_n': len(clat), 'clean_p50_ms': r0(q(clat, .5)), 'clean_p50_ci95_call_cluster': ci(boot_cluster(cgroups, .5, rng)), 'clean_p90_ms': r0(q(clat, .9)),
         'cutin_main': f'{cut(main)}/{len(main)}', 'cutin_main_rate': round(cut(main) / len(main), 3), 'cutin_main_wilson95': '%s-%s' % wilson(cut(main), len(main)),
         'cutin_gap_turns': f'{cut(gapt)}/{len(gapt)}', 'cutin_clean_turns': f'{cut(clean)}/{len(clean)}',
         'pause_cutin': f'{cut(pause)}/{len(pause)}', 'pause_cutin_wilson95': '%s-%s' % wilson(cut(pause), len(pause)),
         'unanswered_reasons': '; '.join(f'{k}: {v}' for k, v in why.items()),
         'turns_with_any_error': sum(1 for r in main if (r['resp_errs'] or r['errs'])),
         'gate_substitutions': sum(1 for r in main if r['gate_fail'] not in ('', '[]'))}
  lat_rows.append(rec)
  # stage breakdown (medians over answered main turns)
  comp_rows.append({'config': cfg, 'stt_last_final_rel_end_p50_ms': r0(q([f(r['stt_last_final_rel_end_ms']) for r in main], .5)),
                    'llm_ttft_p50_ms': r0(q([f(r['llm_ttft_ms']) for r in main], .5)), 'llm_ttft_p90_ms': r0(q([f(r['llm_ttft_ms']) for r in main], .9)),
                    'first_clause_rel_end_p50_ms': r0(q([f(r['first_clause_rel_end_ms']) for r in main], .5)),
                    'llm_done_rel_end_p50_ms': r0(q([f(r['llm_done_rel_end_ms']) for r in main], .5)), 'llm_done_rel_end_p90_ms': r0(q([f(r['llm_done_rel_end_ms']) for r in main], .9)),
                    'tts_ttfb_p50_ms': r0(q([f(r['tts_ttfb_ms']) for r in main], .5)), 'tts_ttfb_p90_ms': r0(q([f(r['tts_ttfb_ms']) for r in main], .9)),
                    'first_audio_p50_ms': rec['p50_ms'], 'llm_requests_per_turn_mean': round(st.mean(int(r['n_resps'] or 0) for r in main), 2)})
  for p in ('P1', 'P2', 'P4'):
    pr = [r for r in main if r['persona'] == p]; pl = [f(r['latency_ms']) for r in pr if f(r['latency_ms']) is not None]
    k = cut(pr); persona_rows.append({'config': cfg, 'persona': {'P1': 'P1 urban Hinglish', 'P2': 'P2 Bhojpuri-Hindi, market babble', 'P4': 'P4 elderly slow Hindi'}[p],
                                      'turns': len(pr), 'answered': len(pl), 'p50_ms': r0(q(pl, .5)), 'p90_ms': r0(q(pl, .9)),
                                      'cutin_turns': f'{k}/{len(pr)}', 'cutin_rate': round(k / len(pr), 3) if pr else None, 'cutin_wilson95': '%s-%s' % wilson(k, len(pr))})
  # elderly pause: when in the 2.42 s pause did the agent start talking
  into = []; head = []
  for r in pause:
    for c in json.loads(r['cutins'] or '[]'):
      t_abs = PAUSE['last_sp_ms'] + c['rel_end_ms']
      if P_START <= t_abs <= P_END + 200: into.append(t_abs - P_START); head.append(P_END - t_abs)
  pause_rows.append({'config': cfg, 'pause_turns': len(pause), 'cutin_turns': cut(pause), 'wilson95': '%s-%s' % wilson(cut(pause), len(pause)),
                     'pause_start_ms_in_clip': P_START, 'pause_len_ms': PAUSE['gaps'][0][1],
                     'agent_audio_ms_into_pause_p50': r0(q(into, .5)), 'agent_audio_ms_into_pause_min_max': f'{r0(min(into))}-{r0(max(into))}' if into else '',
                     'headroom_before_caller_resumes_ms_p50': r0(q(head, .5)),
                     'answered_after_true_end': f"{sum(1 for r in pause if f(r['latency_ms']) is not None)}/{len(pause)}",
                     'latency_after_true_end_p50_ms': r0(q([f(r['latency_ms']) for r in pause], .5))})
  passes = len({r['session'].split('-pass')[-1] for r in main})
  full = cfg in ('C1_az_az41_azneural', 'C2_az_az41_azhd', 'C3_az_or_azhd', 'C6_gtl_or_azneural', 'C7_az_gm_azneural', 'C8_gtl_gm_azneural')
  status_rows.append({'config': cfg, 'status': 'complete (as designed)' if full else 'partial (validation run: 1 pass)',
                      'main_turns': f'{len(main)} ({passes} passes x P1,P2,P4 x 10 clips; silence clip t07 not timed)', 'pause_repeats': len(pause),
                      'personas_not_run': 'P3 Tamil-English (Azure STT was hi-IN only; harness default PERSONAS=P1,P2,P4)',
                      'unanswered': f'{len(unans)} ({rec["unanswered_reasons"]})' if unans else '0',
                      'tier_caveat': ('Gemini free tier (gm LLM)' if '_gm_' in cfg else '') + ('; gemini-3.5-transcribe-live on free tier' if '_gtl_' in cfg else ''),
                      'concurrency_caveat': 'C1,C2,C3,C6,C7 ran concurrently 19:12-19:24Z on one 4-vCPU VM; C8 alone 19:27-19:37Z; gated pair concurrently 19:46-19:51Z'})
for name, why in (('C4_az_gm_gtts (Azure STT + gemini-3.5-flash-lite + gemini-3.8-flash-lite-tts)', 'NOT RUN end-to-end: free-tier TTS cap of 10 requests/day/model (smoke turns returned 429; runlogs/smoke1.out)'),
                  ('C5_gtl_gm_gtts (all-Gemini: transcribe-live + 3.5-flash-lite + 3.8-flash-tts)', 'NOT RUN end-to-end: same free-tier TTS cap; computed composite only (composite_gemini_tts_latency.csv)')):
  status_rows.append({'config': name, 'status': 'not measured end-to-end', 'main_turns': '0', 'pause_repeats': 0, 'personas_not_run': 'all', 'unanswered': '', 'tier_caveat': why, 'concurrency_caveat': ''})
write('rederived_latency.csv', lat_rows); write('rederived_latency_stages.csv', comp_rows); write('rederived_latency_by_persona.csv', persona_rows)
write('rederived_pause_cutins.csv', pause_rows); write('config_status.csv', status_rows)

# ---------------- check against the pre-restart analysis (analyze.py output) ----------------
orig = {r['config']: r for r in rd(os.path.join(RES, 'cascade_summary.csv'))}
chk = []
for r in lat_rows:
  o = orig.get(r['config'], {})
  for a, b in (('p50_ms', 'p50_ms'), ('p90_ms', 'p90_ms'), ('clean_p50_ms', 'clean_p50_ms'), ('answered', 'turns_answered'), ('cutin_main', 'cutin_turns_main'),
               ('pause_cutin', 'elderly_pause_cutin'), ('cutin_gap_turns', 'cutin_gap_turns'), ('cutin_clean_turns', 'cutin_clean_turns')):
    chk.append({'config': r['config'], 'metric': a, 'rederived': r[a], 'pre_restart_analysis': o.get(b), 'match': str(r[a]) == str(o.get(b))})
write('rederived_check_vs_pre_restart.csv', chk)

# ---------------- COMPUTED composites: cascades with Gemini TTS (g5 paid-tier India first-byte samples) ----------------
G5T = [x for x in rd(os.path.join(G5, 'tts_requests.csv')) if x['vantage'] == 'centralindia' and x['mode'] == 'stream' and x['http'] == '200' and f(x['ttfb_ms'])]
TTFB = {m: [f(x['ttfb_ms']) for x in G5T if x['model'] == m] for m in ('gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts')}
AZTTFB = {c['config']: c['tts_ttfb_p50_ms'] for c in comp_rows}
def composite(src_cfg, tts_model, mode):
  rows = [r for r in T[src_cfg] if not r['session'].startswith('P4pause')]
  col = 'llm_done_rel_end_ms' if mode == 'whole reply after LLM done (harness C4/C5 design)' else 'first_clause_rel_end_ms'
  base = collections.defaultdict(list)
  for r in rows:
    v = f(r[col])
    if v is not None and f(r['latency_ms']) is not None: base[r['session']].append(v)
  tt = TTFB[tts_model]
  allv = [b + t for k in base for b in base[k] for t in tt]
  # CI: resample sessions (calls) of the cascade AND the TTS sample, independently
  s50 = []; s90 = []; ks = list(base)
  for _ in range(1500):
    pick = [x for k in (ks[rng.randrange(len(ks))] for _ in ks) for x in base[k]]
    ts_ = [tt[rng.randrange(len(tt))] for _ in tt]
    v = [b + t for b in pick for t in ts_]; s50.append(q(v, .5)); s90.append(q(v, .9))
  s50.sort(); s90.sort()
  return {'p50_ms': r0(q(allv, .5)), 'p50_ci95': f'{r0(s50[37])}-{r0(s50[1462])}', 'p90_ms': r0(q(allv, .9)), 'p90_ci95': f'{r0(s90[37])}-{r0(s90[1462])}',
          'share_le_1200': round(sum(1 for x in allv if x <= 1200) / len(allv), 3), 'n_turns': sum(len(v) for v in base.values()), 'n_tts_samples': len(tt)}
DESIGNS = [
  ('G-A all-Gemini lite: transcribe-live + 3.5-flash-lite + 3.8-flash-lite-tts', 'C8_gtl_gm_azneural', 'gemini-3.8-flash-lite-tts'),
  ('G-B all-Gemini: transcribe-live + 3.5-flash-lite + 3.8-flash-tts', 'C8_gtl_gm_azneural', 'gemini-3.8-flash-tts'),
  ('G-C mixed: Azure STT + 3.5-flash-lite + 3.8-flash-lite-tts', 'C7_az_gm_azneural', 'gemini-3.8-flash-lite-tts'),
  ('G-D mixed cheap LLM: Azure STT + gpt-oss-120b@Groq + 3.8-flash-lite-tts', 'C3_az_or_azhd', 'gemini-3.8-flash-lite-tts'),
  ('G-E mixed cheap LLM: transcribe-live + gpt-oss-120b@Groq + 3.8-flash-lite-tts', 'C6_gtl_or_azneural', 'gemini-3.8-flash-lite-tts'),
  ('G-F mixed cheap LLM: Azure STT + gpt-oss-120b@Groq + 3.8-flash-tts', 'C3_az_or_azhd', 'gemini-3.8-flash-tts'),
]
crow = []
for name, src, tm in DESIGNS:
  for mode in ('whole reply after LLM done (harness C4/C5 design)', 'first clause sent alone (lower bound; splits prosody across requests)'):
    c = composite(src, tm, mode)
    crow.append({'design': name, 'tts_request_mode': mode, 'stt_llm_timings_from': src + ' (measured, Central India VM)',
                 'tts_first_byte_from': f'g5-gemini-paid tts_requests.csv, {tm}, stream, paid tier, Central India VM (n={c["n_tts_samples"]})', **c,
                 'method': 'computed: per-turn measured STT+LLM time to (LLM done | first clause) after caller end + independent draw of measured Gemini TTS first byte; all pairs',
                 'not_included': 'Gemini TTS leading silence 0.14-0.36 s before audible speech (g5); inter-request queueing; free->paid LLM latency change'})
write('composite_gemini_tts_latency.csv', crow)
# pause counterfactual: shift each measured pause cut-in by (whole-reply wait + Gemini first byte - Azure first byte)
pcf = []
for name, src, tm in DESIGNS:
  s = [r for r in comp_rows if r['config'] == src][0]
  shift = (s['llm_done_rel_end_p50_ms'] - s['first_clause_rel_end_p50_ms']) + q(TTFB[tm], .5) - s['tts_ttfb_p50_ms']
  pr = [x for x in pause_rows if x['config'] == src][0]
  heads = []
  for r in T[src]:
    if not r['session'].startswith('P4pause'): continue
    for c in json.loads(r['cutins'] or '[]'):
      t_abs = PAUSE['last_sp_ms'] + c['rel_end_ms']
      if P_START <= t_abs <= P_END + 200: heads.append(P_END - t_abs)
  still = sum(1 for h in heads if h > shift)
  pcf.append({'design': name, 'source_config': src, 'median_shift_ms': r0(shift), 'measured_pause_cutins': f"{pr['cutin_turns']}/{pr['pause_turns']}",
              'counterfactual_pause_cutins': f'{still}/{pr["pause_turns"]}',
              'method': 'computed, low confidence: a response whose first audio would land before the caller resumes still cuts in; the rest would be cancelled by the harness on resume'})
write('composite_gemini_tts_pause_counterfactual.csv', pcf)

# ---------------- usage per exchange (all LLM requests in a turn, including superseded and cancelled ones) ----------------
usage = {}
for cfg in T:
  main = [r for r in T[cfg] if not r['session'].startswith('P4pause')]
  rb = collections.defaultdict(list)
  for x in R[cfg]: rb[(x['session'], x['clip'])].append(x)
  used_p_all = [f(x['prompt_tokens']) for x in R[cfg] if x['used'] == 'True' and f(x['prompt_tokens'])]
  med_used = st.median(used_p_all)
  ex = []; seq = collections.Counter(); pts = []; imputed = 0
  for r in sorted(main, key=lambda r: r['ts']):
    seq[r['session']] += 1; k = seq[r['session']]
    rs = rb.get((r['session'], r['clip']), []); used = [x for x in rs if x['used'] == 'True']
    up = f(used[0]['prompt_tokens']) if used and f(used[0]['prompt_tokens']) else None
    if up: pts.append((k, up))
    meas_p = sum(f(x['prompt_tokens']) or 0 for x in rs); meas_c = sum(f(x['cached_tokens']) or 0 for x in rs)
    miss = [x for x in rs if x['llm_status'] == '200' and not f(x['prompt_tokens'])]; imputed += len(miss)
    add = len(miss) * (up or med_used)
    ex.append({'k': k, 'p': meas_p + add, 'c': meas_c + (add * meas_c / meas_p if meas_p else 0), 'o': sum(f(x['completion_tokens']) or 0 for x in rs),
               'chars': sum(f(x['tts_chars']) or 0 for x in rs), 'agent_s': sum((f(x['audio_bytes']) or 0) for x in used) / 8000.0,
               'caller_s': CLIP[r['clip']]['dur_s'], 'lat_s': (f(r['latency_ms']) or 0) / 1000, 'or_cost': sum(f(x['or_cost_usd']) or 0 for x in rs), 'used_p': up})
  # gated runs: billable STT seconds actually streamed per exchange
  sent = []; prev = {}
  for r in sorted(main, key=lambda r: r['ts']):
    v = f(r.get('stt_audio_sent_s_cum'))
    if v is not None: sent.append(v - prev.get(r['session'], 0.0)); prev[r['session']] = v
  xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; mx, my = st.mean(xs), st.mean(ys)
  slope = sum((a - mx) * (b - my) for a, b in pts) / sum((a - mx) ** 2 for a in xs); base = my - slope * mx
  n = len(ex); m = lambda key: sum(e[key] for e in ex) / n
  usage[cfg] = {'config': cfg, 'exchanges': n, 'used_prompt_at_exchange1': round(base + slope), 'prompt_growth_per_exchange': round(slope, 1),
                'llm_requests_waste_factor': round(m('p') / st.mean(e['used_p'] for e in ex if e['used_p']), 3), 'cached_share': round(m('c') / m('p'), 3),
                'prompt_tokens_per_exchange_billed': round(m('p')), 'completion_tokens_per_exchange_billed': round(m('o'), 1),
                'tts_chars_per_exchange_billed': round(m('chars'), 1), 'agent_audio_s_per_exchange': round(m('agent_s'), 2), 'caller_audio_s_per_exchange': round(m('caller_s'), 2),
                'reply_latency_s_mean': round(m('lat_s'), 3), 'exchange_s': round(m('caller_s') + m('lat_s') + m('agent_s'), 2),
                'exchanges_per_min_battery': round(60 / (m('caller_s') + m('lat_s') + m('agent_s')), 2),
                'agent_talk_share_battery': round(m('agent_s') / (m('caller_s') + m('lat_s') + m('agent_s')), 3),
                'chars_per_agent_s': round(m('chars') / m('agent_s'), 2) if m('agent_s') else None,
                'stt_gated_sent_s_per_exchange': round(st.mean(sent), 2) if sent else None,
                'openrouter_reported_usd_per_exchange': round(m('or_cost'), 7) if m('or_cost') else None, 'cancelled_streams_prompt_imputed': imputed,
                '_base': base, '_slope': slope}
write('rederived_usage_per_exchange.csv', [{k: v for k, v in u.items() if not k.startswith('_')} for u in usage.values()])

# ---------------- prices (paid list; USD). Re-read 2026-10-19 where marked; see cost_inputs.csv ----------------
LLMP = {'az:g3-gpt-4-1-mini-std': (0.44, 0.11, 1.76), 'or:openai/gpt-oss-120b@groq': (0.15, 0.075, 0.60), 'gm:gemini-3.5-flash-lite': (0.30, 0.03, 2.50)}
STT_AZ = 1.00 / 3600; STT_AZ_C100K = 0.40 / 3600       # per audio second (S1 PAYG; 100K-h commitment overage rate)
GTL_A = 25 * 3.5e-6; GTL_TXT_TOK = 14.6; GTL_TXT = 21e-6; GTL_TXT_PUB_MIN = 0.004   # per audio s; text tok per utterance; per text tok
AZ_TTS = {'neural': 15e-6, 'hd': 22e-6, 'neural_c2000M': 7.5e-6}                  # per character
GEM_TTS = {('gemini-3.8-flash-lite-tts', 2026): (0.5e-6, 6e-6), ('gemini-3.8-flash-lite-tts', 2027): (1e-6, 12e-6),
           ('gemini-3.8-flash-tts', 2026): (0.5e-6, 9e-6), ('gemini-3.8-flash-tts', 2027): (1e-6, 18e-6)}   # (text in per tok, audio out per tok)
G5IN = st.mean(f(x['text_in_tok']) for x in G5T)                                     # text-in tokens per TTS request (incl. style), g5 measured
GEM_LEAD_S = 0.25                                                                     # billed leading silence per request (g5: 0.14-0.36 s)
GATE_RATIO = None
if usage.get('C1_az_az41_azneural+gatedSTT', {}).get('stt_gated_sent_s_per_exchange'):
  GATE_RATIO = usage['C1_az_az41_azneural+gatedSTT']['stt_gated_sent_s_per_exchange'] / usage['C1_az_az41_azneural+gatedSTT']['caller_audio_s_per_exchange']

def llm_usd(u, N, prices):
  pin, pc, pout = prices; tot = 0.0
  for k in range(1, N + 1):
    p = (u['_base'] + u['_slope'] * k) * u['llm_requests_waste_factor']
    tot += p * (1 - u['cached_share']) * pin / 1e6 + p * u['cached_share'] * pc / 1e6
  return tot + N * u['completion_tokens_per_exchange_billed'] * pout / 1e6

SHAPES = {'battery-measured': None, 'reference (5 exch/min, agent 24 s/min, caller 24 s/min)': (5.0, 24.0, 24.0)}
cost = []
def add_cost(label, kind, stt, llm_cfg, llm_arm, tts, L, shape, u_src):
  u = usage[u_src]
  if SHAPES[shape] is None: epm = u['exchanges_per_min_battery']; agent_s_min = u['agent_audio_s_per_exchange'] * epm; caller_s_min = u['caller_audio_s_per_exchange'] * epm
  else: epm, agent_s_min, caller_s_min = SHAPES[shape]
  N = max(1, round(epm * L))
  # STT
  if stt == 'az': s_usd = L * 60 * STT_AZ
  elif stt == 'az_gated': s_usd = L * caller_s_min * GATE_RATIO * STT_AZ
  elif stt == 'az_c100k_gated': s_usd = L * caller_s_min * GATE_RATIO * STT_AZ_C100K
  elif stt == 'gtl': s_usd = L * 60 * GTL_A + N * GTL_TXT_TOK * GTL_TXT
  elif stt == 'gtl_gated': s_usd = L * caller_s_min * GATE_RATIO * GTL_A + N * GTL_TXT_TOK * GTL_TXT
  elif stt == 'gtl_pubtext': s_usd = L * (60 * GTL_A + GTL_TXT_PUB_MIN)
  l_usd = llm_usd(usage[llm_cfg], N, LLMP[llm_arm])
  # TTS
  if tts in AZ_TTS:
    chars_min = (u['tts_chars_per_exchange_billed'] * epm) if SHAPES[shape] is None else agent_s_min * usage[u_src]['chars_per_agent_s']
    t_usd = L * chars_min * AZ_TTS[tts]
  else:
    model, yr = tts; tin, tout = GEM_TTS[(model, yr)]
    t_usd = L * (agent_s_min + epm * GEM_LEAD_S) * 25 * tout + N * G5IN * tin
  tot = s_usd + l_usd + t_usd
  cost.append({'stack': label, 'kind': kind, 'shape': shape, 'call_min': L, 'exchanges': N, 'stt_inr_per_min': round(s_usd * FX / L, 3), 'llm_inr_per_min': round(l_usd * FX / L, 3),
               'tts_inr_per_min': round(t_usd * FX / L, 3), 'ai_inr_per_min': round(tot * FX / L, 3), 'ai_inr_per_call': round(tot * FX, 2)})
STACKS = [
  ('C1 Azure STT + gpt-4.1-mini + Azure neural', 'measured end-to-end', 'az', 'C1_az_az41_azneural', 'az:g3-gpt-4-1-mini-std', 'neural', 'C1_az_az41_azneural'),
  ('C1+gated: same, VAD-gated STT', 'measured end-to-end (1 pass)', 'az_gated', 'C1_az_az41_azneural+gatedSTT', 'az:g3-gpt-4-1-mini-std', 'neural', 'C1_az_az41_azneural+gatedSTT'),
  ('C2 Azure STT + gpt-4.1-mini + Azure DragonHD', 'measured end-to-end', 'az', 'C2_az_az41_azhd', 'az:g3-gpt-4-1-mini-std', 'hd', 'C2_az_az41_azhd'),
  ('C3 Azure STT + gpt-oss-120b@Groq + Azure DragonHD', 'measured end-to-end', 'az', 'C3_az_or_azhd', 'or:openai/gpt-oss-120b@groq', 'hd', 'C3_az_or_azhd'),
  ('C6 transcribe-live + gpt-oss-120b@Groq + Azure neural', 'measured end-to-end', 'gtl', 'C6_gtl_or_azneural', 'or:openai/gpt-oss-120b@groq', 'neural', 'C6_gtl_or_azneural'),
  ('C6+gated: same, VAD-gated STT', 'measured end-to-end (1 pass)', 'gtl_gated', 'C6_gtl_or_azneural+gatedSTT', 'or:openai/gpt-oss-120b@groq', 'neural', 'C6_gtl_or_azneural+gatedSTT'),
  ('C7 Azure STT + gemini-3.5-flash-lite + Azure neural', 'measured end-to-end', 'az', 'C7_az_gm_azneural', 'gm:gemini-3.5-flash-lite', 'neural', 'C7_az_gm_azneural'),
  ('C8 transcribe-live + gemini-3.5-flash-lite + Azure neural', 'measured end-to-end', 'gtl', 'C8_gtl_gm_azneural', 'gm:gemini-3.5-flash-lite', 'neural', 'C8_gtl_gm_azneural'),
  ('G-A all-Gemini lite (transcribe-live + 3.5-flash-lite + 3.8-flash-lite-tts), 2026 TTS price', 'computed composite', 'gtl', 'C8_gtl_gm_azneural', 'gm:gemini-3.5-flash-lite', ('gemini-3.8-flash-lite-tts', 2026), 'C8_gtl_gm_azneural'),
  ('G-A all-Gemini lite, 2027 TTS price', 'computed composite', 'gtl', 'C8_gtl_gm_azneural', 'gm:gemini-3.5-flash-lite', ('gemini-3.8-flash-lite-tts', 2027), 'C8_gtl_gm_azneural'),
  ('G-B all-Gemini (3.8-flash-tts), 2026 TTS price', 'computed composite', 'gtl', 'C8_gtl_gm_azneural', 'gm:gemini-3.5-flash-lite', ('gemini-3.8-flash-tts', 2026), 'C8_gtl_gm_azneural'),
  ('G-B all-Gemini (3.8-flash-tts), 2027 TTS price', 'computed composite', 'gtl', 'C8_gtl_gm_azneural', 'gm:gemini-3.5-flash-lite', ('gemini-3.8-flash-tts', 2027), 'C8_gtl_gm_azneural'),
  ('G-C Azure STT + 3.5-flash-lite + 3.8-flash-lite-tts, 2026', 'computed composite', 'az', 'C7_az_gm_azneural', 'gm:gemini-3.5-flash-lite', ('gemini-3.8-flash-lite-tts', 2026), 'C7_az_gm_azneural'),
  ('G-D Azure STT + gpt-oss-120b@Groq + 3.8-flash-lite-tts, 2026', 'computed composite', 'az', 'C3_az_or_azhd', 'or:openai/gpt-oss-120b@groq', ('gemini-3.8-flash-lite-tts', 2026), 'C3_az_or_azhd'),
  ('G-E transcribe-live gated + gpt-oss-120b@Groq + 3.8-flash-lite-tts, 2026', 'computed composite', 'gtl_gated', 'C6_gtl_or_azneural', 'or:openai/gpt-oss-120b@groq', ('gemini-3.8-flash-lite-tts', 2026), 'C6_gtl_or_azneural'),
  ('G-E same, 2027 TTS price', 'computed composite', 'gtl_gated', 'C6_gtl_or_azneural', 'or:openai/gpt-oss-120b@groq', ('gemini-3.8-flash-lite-tts', 2027), 'C6_gtl_or_azneural'),
  ('L-1 C6 + gated STT + Azure neural 2000M-char commitment', 'computed lever', 'gtl_gated', 'C6_gtl_or_azneural', 'or:openai/gpt-oss-120b@groq', 'neural_c2000M', 'C6_gtl_or_azneural'),
  ('L-2 Azure STT 100K-h commitment gated + gpt-oss-120b@Groq + neural 2000M commitment', 'computed lever', 'az_c100k_gated', 'C6_gtl_or_azneural', 'or:openai/gpt-oss-120b@groq', 'neural_c2000M', 'C6_gtl_or_azneural'),
  ('U-1 C6 with transcription text at Google published $0.004/min (upper)', 'computed sensitivity', 'gtl_pubtext', 'C6_gtl_or_azneural', 'or:openai/gpt-oss-120b@groq', 'neural', 'C6_gtl_or_azneural'),
]
for label, kind, stt, lc, la, tts, us in STACKS:
  for shape in SHAPES:
    for L in (1, 3, 5, 10): add_cost(label, kind, stt, lc, la, tts, L, shape, us)
write('rederived_cost_per_min.csv', cost)

# OpenRouter cross-check: computed per-exchange LLM cost vs OpenRouter's own usage.cost for the gpt-oss configs
orx = []
for cfg in ('C3_az_or_azhd', 'C6_gtl_or_azneural', 'C6_gtl_or_azneural+gatedSTT'):
  u = usage[cfg]; pin, pc, pout = LLMP['or:openai/gpt-oss-120b@groq']
  rs = [x for x in R[cfg] if f(x['prompt_tokens'])]
  comp = sum(((f(x['prompt_tokens']) - (f(x['cached_tokens']) or 0)) * pin + (f(x['cached_tokens']) or 0) * pc + (f(x['completion_tokens']) or 0) * pout) / 1e6 for x in rs)
  rep = sum(f(x['or_cost_usd']) or 0 for x in rs)
  orx.append({'config': cfg, 'responses_with_usage': len(rs), 'computed_usd_from_tokens_x_list_price': round(comp, 6), 'openrouter_reported_usd': round(rep, 6),
              'ratio_reported_over_computed': round(rep / comp, 3) if comp else None})
write('rederived_openrouter_crosscheck.csv', orx)

# ---------------- TTS cost at EQUAL agent text (content-normalised; voices speak at different rates) ----------------
man = rd(os.path.join(os.path.dirname(RES), 'samples', 'manifest.csv'))
cps = collections.defaultdict(list)
for x in man: cps[x['file'].split('__')[1][:-4]].append(len(x['text']) / float(x['duration_s']))
GCPS = {'gemini-3.8-flash-lite-tts': st.mean(cps['gflashlite-Despina']), 'gemini-3.8-flash-tts': st.mean(cps['gflash-Despina'])}
eq = []
for chars_min in (240, 400):
  for name, per_char in (('Azure neural PAYG ($15/1M chars)', AZ_TTS['neural']), ('Azure neural 2000M-char commitment ($7.50/1M)', AZ_TTS['neural_c2000M']), ('Azure DragonHD / Neural HD PAYG ($22/1M)', AZ_TTS['hd'])):
    eq.append({'agent_chars_per_min': chars_min, 'tts': name, 'speaking_rate_chars_per_s': '', 'agent_audio_s_per_min': '', 'inr_per_connected_min': round(chars_min * per_char * FX, 3)})
  for (model, yr), (tin, tout) in GEM_TTS.items():
    secs = chars_min / GCPS[model] + 5 * GEM_LEAD_S
    eq.append({'agent_chars_per_min': chars_min, 'tts': f'{model} ({yr} price; 25 tok/s; +0.25 s lead per request x 5)', 'speaking_rate_chars_per_s': round(GCPS[model], 2),
               'agent_audio_s_per_min': round(secs, 1), 'inr_per_connected_min': round((secs * 25 * tout + 5 * G5IN * tin) * FX, 3)})
write('tts_cost_equal_content.csv', eq)

# ---------------- AI budget implied by a Rs 2 price ----------------
bud = []
for gst in ('price ex-GST (B2B, GST added on top)', 'price GST-inclusive (18% inside)'):
  net = 2.0 if gst.startswith('price ex') else 2.0 / 1.18
  for margin in (0.4, 0.5, 0.6):
    for tel in (0.38, 0.43, 0.48):
      bud.append({'gst_treatment': gst, 'net_revenue_inr_per_min': round(net, 3), 'gross_margin': margin, 'telephony_inr_per_min': tel,
                  'allowed_ai_inr_per_min': round(net * (1 - margin) - tel, 3)})
write('ai_budget.csv', bud)

# ---------------- side by side with g5 (Gemini Live, paid tier) ----------------
g5l = rd(os.path.join(G5, 'latency_summary.csv')); g5c = rd(os.path.join(G5, 'cost_per_minute_summary.csv')); g5p = rd(os.path.join(G5, 'quality_elderly_pause_cutins.csv'))
side = []
ref = 'reference (5 exch/min, agent 24 s/min, caller 24 s/min)'
def cpm(label, L, shape=ref):
  for c in cost:
    if c['stack'] == label and c['call_min'] == L and c['shape'] == shape: return c['ai_inr_per_min']
for label, cfgname in (('C1 Azure STT + gpt-4.1-mini + Azure neural', 'C1_az_az41_azneural'), ('C2 Azure STT + gpt-4.1-mini + Azure DragonHD', 'C2_az_az41_azhd'),
                       ('C3 Azure STT + gpt-oss-120b@Groq + Azure DragonHD', 'C3_az_or_azhd'), ('C6 transcribe-live + gpt-oss-120b@Groq + Azure neural', 'C6_gtl_or_azneural'),
                       ('C6+gated: same, VAD-gated STT', 'C6_gtl_or_azneural+gatedSTT'), ('C7 Azure STT + gemini-3.5-flash-lite + Azure neural', 'C7_az_gm_azneural'),
                       ('C8 transcribe-live + gemini-3.5-flash-lite + Azure neural', 'C8_gtl_gm_azneural')):
  lr = [r for r in lat_rows if r['config'] == cfgname][0]
  side.append({'stack': label, 'type': 'cascade (gated text, measured)', 'vantage': 'Central India VM', 'tier': 'paid list price; LLM/STT free tier where Gemini',
               'first_audio_p50_ms': lr['p50_ms'], 'p50_ci95_call_cluster': lr['p50_ci95_call_cluster'], 'p90_ms': lr['p90_ms'], 'n_turns': lr['answered'],
               'talk_over_or_cutin_main': lr['cutin_main'], 'elderly_pause_cutin': lr['pause_cutin'],
               'ai_inr_per_min_1': cpm(label, 1), 'ai_inr_per_min_3': cpm(label, 3), 'ai_inr_per_min_5': cpm(label, 5), 'ai_inr_per_min_10': cpm(label, 10),
               'text_gate_before_audio': 'yes (every clause passes the code gate before TTS)'})
for name, _, tm in DESIGNS[:4]:
  c = [x for x in crow if x['design'] == name and x['tts_request_mode'].startswith('whole')][0]
  lbl = {'G-A': 'G-A all-Gemini lite (transcribe-live + 3.5-flash-lite + 3.8-flash-lite-tts), 2026 TTS price', 'G-B': 'G-B all-Gemini (3.8-flash-tts), 2026 TTS price',
         'G-C': 'G-C Azure STT + 3.5-flash-lite + 3.8-flash-lite-tts, 2026', 'G-D': 'G-D Azure STT + gpt-oss-120b@Groq + 3.8-flash-lite-tts, 2026'}[name[:3]]
  side.append({'stack': name, 'type': 'cascade with Gemini TTS (computed composite)', 'vantage': 'Central India VM (components)', 'tier': 'TTS paid (g5); STT/LLM as measured',
               'first_audio_p50_ms': c['p50_ms'], 'p50_ci95_call_cluster': c['p50_ci95'], 'p90_ms': c['p90_ms'], 'n_turns': c['n_turns'],
               'talk_over_or_cutin_main': 'not measured', 'elderly_pause_cutin': 'see composite_gemini_tts_pause_counterfactual.csv',
               'ai_inr_per_min_1': cpm(lbl, 1), 'ai_inr_per_min_3': cpm(lbl, 3), 'ai_inr_per_min_5': cpm(lbl, 5), 'ai_inr_per_min_10': cpm(lbl, 10), 'text_gate_before_audio': 'yes'})
for model in ('3.1-flash-live', '3.8-live'):
  l = [r for r in g5l if r['model'] == model and r['tier'] == 'paid' and r['vantage'] == 'centralindia-vm' and r['turns'] == 'all reply turns'][0]
  pz = [r for r in g5p if r['model'] == model and r['tier'] == 'paid' and r['vantage'] == 'centralindia-vm'][0]
  for comp in ('off', 'on (trigger 6000, target 3000)'):
    cc = {int(float(r['minutes'])): r['inr_per_min_mean'] for r in g5c if r['model'] == model and r['compression'] == comp}
    side.append({'stack': f'Gemini Live {model}, compression {comp}', 'type': 'speech-to-speech (g5, measured)', 'vantage': 'Central India VM', 'tier': 'paid',
                 'first_audio_p50_ms': l['p50_ms'], 'p50_ci95_call_cluster': l['p50_ci95_call_cluster'], 'p90_ms': l['p90_ms'], 'n_turns': l['n'],
                 'talk_over_or_cutin_main': l['cutin_turns'] + ' (talk-over, all turns incl. pause; excluded from p50)', 'elderly_pause_cutin': f"{pz['cutins']}/{pz['pause_clip_turns']}",
                 'ai_inr_per_min_1': cc.get(1), 'ai_inr_per_min_3': cc.get(3), 'ai_inr_per_min_5': cc.get(5), 'ai_inr_per_min_10': cc.get(10),
                 'text_gate_before_audio': 'transcript arrives with first audio (g5); gate possible only by buffering'})
write('side_by_side_g5.csv', side)

# ---------------- digest ----------------
print('## Latency (Central India VM; caller end of speech -> first agent audio byte; no telephone leg)')
md(lat_rows, ['config', 'answered', 'p50_ms', 'p50_ci95_call_cluster', 'p90_ms', 'p90_ci95_call_cluster', 'share_le_1200', 'clean_p50_ms', 'cutin_main', 'cutin_main_wilson95', 'pause_cutin', 'unanswered_reasons'])
md(comp_rows, list(comp_rows[0].keys()))
md(persona_rows, list(persona_rows[0].keys()))
md(pause_rows, list(pause_rows[0].keys()))
print('## check vs pre-restart analysis: mismatches'); md([c for c in chk if not c['match']] or [{'config': 'none', 'metric': 'all match'}], ['config', 'metric', 'rederived', 'pre_restart_analysis'])
print('## composite Gemini-TTS cascades (computed)'); md(crow, ['design', 'tts_request_mode', 'p50_ms', 'p50_ci95', 'p90_ms', 'share_le_1200', 'n_turns', 'n_tts_samples'])
md(pcf, list(pcf[0].keys()))
print('## usage'); md([{k: v for k, v in u.items() if not k.startswith('_')} for u in usage.values()], [k for k in next(iter(usage.values())) if not k.startswith('_')])
print('## cost per connected minute (INR), reference shape'); md([c for c in cost if c['shape'] == ref], ['stack', 'call_min', 'exchanges', 'stt_inr_per_min', 'llm_inr_per_min', 'tts_inr_per_min', 'ai_inr_per_min', 'ai_inr_per_call'])
print('## cost per connected minute (INR), battery-measured shape'); md([c for c in cost if c['shape'] == 'battery-measured'], ['stack', 'call_min', 'exchanges', 'stt_inr_per_min', 'llm_inr_per_min', 'tts_inr_per_min', 'ai_inr_per_min'])
md(orx, list(orx[0].keys()))
print('GATE_RATIO (gated STT seconds sent / caller clip seconds) =', round(GATE_RATIO, 3), '| G5 TTS text-in tokens per request =', round(G5IN, 1),
      '| TTFB p50 lite/flash =', r0(q(TTFB['gemini-3.8-flash-lite-tts'], .5)), r0(q(TTFB['gemini-3.8-flash-tts'], .5)))
print('## side by side'); md(side, list(side[0].keys()))
print('## TTS at equal content'); md(eq, list(eq[0].keys()))
print('## AI budget'); md(bud, list(bud[0].keys()))
