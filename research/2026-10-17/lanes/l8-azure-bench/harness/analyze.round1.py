# Build the lane's summary tables and cost-inputs.json from raw results (l8-azure-bench, 2026-10-17).
# Usage: python analyze.py RAW_DIR   (RAW_DIR = scratchpad research-raw/l8-azure-bench, for audio-based adjustments)
import os, sys, json, csv, glob, re, unicodedata, collections
import numpy as np, pandas as pd, soundfile as sf

RAW = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__)); RES = os.path.join(HERE, '..', 'results'); LANE = os.path.join(HERE, '..')
FX = 88.0
q = lambda s, p: float(np.percentile(s.dropna(), p)) if s.dropna().size else None

# ---------- network RTT (warm keep-alive, front door answers without model work) ----------
rtt = pd.read_csv(os.path.join(RES, 'rtt.csv'))
rtt_med = rtt.groupby('target').ms.median().to_dict()
RTT_SEA = rtt_med.get('sea-aoai-401', rtt_med.get('sea-stt-host')); RTT_FRC = rtt_med.get('extra-aoai-404')
RTT_SPEECH = rtt_med.get('sea-stt-host')

# ---------- LLM ----------
PRICE = {  # USD per 1M tokens: input, cached input, output (Azure Retail Prices API, fetched 2026-10-17; DZ = Global x1.1)
  'gpt-4.1-mini': (0.40, 0.10, 1.60), 'gpt-4.1-nano': (0.10, 0.025, 0.40), 'gpt-5.4-mini': (0.75, 0.075, 4.50), 'gpt-5.4-nano': (0.20, 0.02, 1.25),
  'gpt-6-luna(DZ-EU)': (0.11, 0.011, 0.55), 'gpt-6-sol(DZ-EU)': (2.20, 0.22, 11.0), 'DeepSeek-V4-Flash(DZ-EU)': (0.21, 0.031, 0.56),
  'DeepSeek-V4.1-Flash': (0.30, 0.006, 1.20), 'Llama-3.3-70B': (0.71, 0.71, 0.71), 'Phi-4': (0.125, 0.125, 0.50), 'gpt-oss-120b': (0.15, 0.15, 0.60),
}
GLOBAL_PRICE = {'gpt-6-luna': (0.10, 0.01, 0.50), 'gpt-6-sol': (2.00, 0.20, 10.0), 'DeepSeek-V4-Flash': (0.19, 0.028, 0.51)}
frames = []
for fn, run in (('llm_bench.csv', 'main'), ('llm_bench_async.csv', 'filter-ab')):
  p = os.path.join(RES, fn)
  if os.path.exists(p):
    d = pd.read_csv(p); d['run'] = run; frames.append(d)
L = pd.concat(frames, ignore_index=True)
L = L[L.status == 200].copy()
L['base_model'] = L.model.str.replace('+async', '', regex=False)
L['filter'] = np.where(L.model.str.endswith('+async'), 'async', 'default')
L['rtt_ms'] = np.where(L.endpoint.str.contains('frc'), RTT_FRC, RTT_SEA)
L['server_ttft_est_ms'] = L.ttft_ms - L.rtt_ms
L['cached_tokens'] = L.cached_tokens.fillna(0)
def cost(r):
  pi, pc, po = PRICE[r.base_model]
  return ((r.prompt_tokens - r.cached_tokens) * pi + r.cached_tokens * pc + r.completion_tokens * po) / 1e6
L['cost_usd'] = L.apply(cost, axis=1)
L['cost_usd_nocache'] = L.apply(lambda r: (r.prompt_tokens * PRICE[r.base_model][0] + r.completion_tokens * PRICE[r.base_model][2]) / 1e6, axis=1)
rows = []
for (run, m, f, arm), g in L.groupby(['run', 'base_model', 'filter', 'cache_arm']):
  rows.append({'run': run, 'model': m, 'content_filter': f, 'cache_arm': arm, 'n': len(g), 'region_served': g.x_ms_region.mode().iat[0],
               'ttft_p50_ms': round(q(g.ttft_ms, 50)), 'ttft_p90_ms': round(q(g.ttft_ms, 90)), 'rtt_ms': round(g.rtt_ms.iat[0]),
               'server_ttft_est_p50_ms': round(q(g.server_ttft_est_ms, 50)), 'server_ttft_est_p90_ms': round(q(g.server_ttft_est_ms, 90)),
               'total_p50_ms': round(q(g.total_ms, 50)), 'first_to_last_p50_ms': round(q(g.first_to_last_ms, 50)) if 'first_to_last_ms' in g and g.first_to_last_ms.notna().any() else None,
               'prompt_tokens_p50': int(q(g.prompt_tokens, 50)), 'cached_share': round(float((g.cached_tokens / g.prompt_tokens).mean()), 3),
               'completion_tokens_p50': int(q(g.completion_tokens, 50)), 'chunks_p50': int(q(g.chunks, 50)),
               'cost_per_turn_usd_mean': round(float(g.cost_usd.mean()), 6), 'cost_per_turn_inr_mean': round(float(g.cost_usd.mean()) * FX, 4),
               'cost_per_turn_inr_if_uncached': round(float(g.cost_usd_nocache.mean()) * FX, 4)})
llm_sum = pd.DataFrame(rows); llm_sum.to_csv(os.path.join(RES, 'llm_summary.csv'), index=False)
# paired filter A/B (same rounds/turns)
ab = L[L.run == 'filter-ab']
abrows = []
for m, g in ab.groupby('base_model'):
  a = g[g['filter'] == 'default'].set_index('round').ttft_ms; b = g[g['filter'] == 'async'].set_index('round').ttft_ms
  idx = a.index.intersection(b.index); diff = (b.loc[idx] - a.loc[idx]).values
  rng = np.random.default_rng(5); bs = [np.median(rng.choice(diff, len(diff))) for _ in range(2000)] if len(diff) else [np.nan]
  abrows.append({'model': m, 'pairs': len(idx), 'default_ttft_p50': round(float(np.median(a))), 'async_ttft_p50': round(float(np.median(b))),
                 'median_paired_diff_ms': round(float(np.median(diff))) if len(diff) else None, 'ci95_lo': round(float(np.percentile(bs, 2.5))), 'ci95_hi': round(float(np.percentile(bs, 97.5))),
                 'default_first_to_last_p50': round(q(g[g['filter'] == 'default'].first_to_last_ms, 50)), 'async_first_to_last_p50': round(q(g[g['filter'] == 'async'].first_to_last_ms, 50))})
pd.DataFrame(abrows).to_csv(os.path.join(RES, 'llm_filter_ab.csv'), index=False)

# ---------- TTS ----------
T = pd.read_csv(os.path.join(RES, 'tts_bench.csv'))
T = T[T.ok == True].copy()
for c in ('sdk_first_byte_ms', 'sdk_finish_ms', 'sdk_service_ms', 'sdk_network_ms'): T[c] = pd.to_numeric(T[c], errors='coerce')
T['chars_per_s'] = T.chars / T.audio_s
T['rtf_client'] = T.total_ms / (T.audio_s * 1000)
def tts_price(v):
  if 'MAI-Voice' in v: return None   # preview; no meter in the Retail Prices API on 2026-10-17
  if 'DragonHD' in v: return 22.0
  if 'Dragon' in v: return 22.0      # DragonLatestNeural preview voice billed as HD (assumption, see report)
  return 15.0
trows = []
for (v, arm), g in T.groupby(['voice', 'arm']):
  pr = tts_price(v); cps = float(g.chars_per_s.median())
  trows.append({'voice': v, 'arm': arm, 'n': len(g), 'ttfb_p50_ms': round(q(g.ttfb_ms, 50)), 'ttfb_p90_ms': round(q(g.ttfb_ms, 90)),
                'service_latency_p50_ms': round(q(g.sdk_service_ms, 50)) if arm == 'ws' else None, 'service_latency_p90_ms': round(q(g.sdk_service_ms, 90)) if arm == 'ws' else None,
                'network_p50_ms': round(q(g.sdk_network_ms, 50)) if arm == 'ws' else None,
                'total_p50_ms': round(q(g.total_ms, 50)), 'audio_s_p50': round(q(g.audio_s, 50), 2), 'rtf_client_p50': round(q(g.rtf_client, 50), 3),
                'chars_per_audio_s': round(cps, 2), 'usd_per_1m_chars': pr, 'inr_per_audio_min': round(cps * 60 * pr / 1e6 * FX, 4) if pr else None})
tts_sum = pd.DataFrame(trows); tts_sum.to_csv(os.path.join(RES, 'tts_summary.csv'), index=False)

# ---------- audio helper: trailing silence (energy, -45 dBFS, 20 ms frames) ----------
def trail_ms(path):
  a, sr = sf.read(path, dtype='float32')
  if a.ndim > 1: a = a.mean(1)
  fr = int(sr * 0.02); n = len(a) // fr
  e = np.array([20 * np.log10(np.sqrt(np.mean(a[i * fr:(i + 1) * fr] ** 2)) + 1e-9) for i in range(n)])
  ref = np.max(e); act = np.where(e > max(ref - 35, -45))[0]
  return (n - 1 - act[-1]) * 20 if len(act) else 0

# ---------- real-time STT latency ----------
p = os.path.join(RES, 'rt_latency.csv')
if os.path.exists(p):
  R = pd.read_csv(p)
  R['trail_ms'] = [trail_ms(os.path.join(RAW, 'asrset', b, u + '.wav')) for u, b in zip(R.uid, R.band)]
  R['final_after_speech_end_ms'] = R.final_after_end_ms + R.trail_ms
  R['final_after_speech_end_minus_rtt_ms'] = R.final_after_speech_end_ms - RTT_SPEECH
  rr = []
  for (s, seg), g in R.groupby(['set', 'seg_timeout_ms']):
    rr.append({'set': s, 'seg_timeout_ms': seg, 'n': len(g), 'missing_final': int(g.final_after_end_ms.isna().sum()),
               'first_partial_p50_ms': round(q(g.first_partial_ms, 50)), 'final_after_speech_end_p50_ms': round(q(g.final_after_speech_end_ms, 50)),
               'final_after_speech_end_p90_ms': round(q(g.final_after_speech_end_ms, 90)), 'minus_rtt_p50_ms': round(q(g.final_after_speech_end_minus_rtt_ms, 50)),
               'rtt_ms': round(RTT_SPEECH)})
  pd.DataFrame(rr).to_csv(os.path.join(RES, 'rt_latency_summary.csv'), index=False)

# ---------- Voice Live ----------
p = os.path.join(RES, 'voicelive.csv')
if os.path.exists(p):
  V = pd.read_csv(p)
  tr = {os.path.basename(f): trail_ms(f) for f in glob.glob(os.path.join(RAW, 'caller', '*.wav'))}
  V['trail_ms'] = V.caller_wav.map(tr)
  for c in ('vad_stop_after_end_ms', 'transcript_after_end_ms', 'first_audio_after_end_ms', 'response_done_after_end_ms'):
    V[c.replace('after_end', 'after_speech_end')] = V[c] + V.trail_ms
  vr = []
  for arm, g in V.groupby('arm'):
    # Voice Live meters (southeastasia, Retail Prices API 2026-10-17), USD per 1K tokens, 'Std' tier for gpt-4.1-mini:
    # LLM text in 0.00066, LLM text out 0.00264, standard speech audio in 0.015, standard speech audio out 0.026.
    U = [json.loads(u) if isinstance(u, str) and u.startswith('{') else {} for u in g.usage]
    tin = sum((u.get('input_token_details') or {}).get('text_tokens', 0) for u in U); ain = sum((u.get('input_token_details') or {}).get('audio_tokens', 0) for u in U)
    tout = sum((u.get('output_token_details') or {}).get('text_tokens', 0) for u in U); aout = sum((u.get('output_token_details') or {}).get('audio_tokens', 0) for u in U)
    usd = (tin * 0.00066 + tout * 0.00264 + ain * 0.015 + aout * 0.026) / 1000
    vr_extra = {'usage_text_in': tin, 'usage_audio_in': ain, 'usage_text_out': tout, 'usage_audio_out': aout,
                'est_usd_per_turn_std_meters': round(usd / max(1, len(g)), 5), 'est_inr_per_min_at_5_turns': round(usd / max(1, len(g)) * 5 * FX, 2)}
    vr.append({'arm': arm, 'sessions': g.session_updated_ms.nunique(), 'turns': len(g), 'session_ready_p50_ms': round(q(g.drop_duplicates('session_updated_ms').session_updated_ms, 50)), **vr_extra,
               'turns_without_response': int(g.first_audio_after_end_ms.isna().sum()), 'turns_without_transcript': int(g.transcript.isna().sum()),
               'vad_stop_after_speech_end_p50_ms': round(q(g.vad_stop_after_speech_end_ms, 50)) if g.vad_stop_after_speech_end_ms.notna().any() else None,
               'first_audio_after_speech_end_p50_ms': round(q(g.first_audio_after_speech_end_ms, 50)), 'first_audio_after_speech_end_p90_ms': round(q(g.first_audio_after_speech_end_ms, 90)),
               'first_audio_minus_rtt_p50_ms': round(q(g.first_audio_after_speech_end_ms, 50) - RTT_SEA), 'rtt_ms': round(RTT_SEA),
               'short_answer_turns_missed': ';'.join(f"{r.caller_wav}:{'no-response' if pd.isna(r.first_audio_after_end_ms) else ''}{'no-transcript' if pd.isna(r.transcript) else ''}" for r in g.itertuples() if pd.isna(r.first_audio_after_end_ms) or pd.isna(r.transcript))})
  pd.DataFrame(vr).to_csv(os.path.join(RES, 'voicelive_summary.csv'), index=False)

# ---------- short-answer probe ----------
ACCEPT = {'हाँ': ['हाँ', 'हां', 'हा', 'haan', 'han', 'ha', 'haa'], 'हाँ जी': ['हाँ जी', 'हां जी', 'हाँजी', 'haan ji', 'haanji', 'haji', 'han ji'],
          'जी': ['जी', 'ji', 'jee'], 'ओके': ['ओके', 'ok', 'okay', 'ओक'], 'हम्म': ['हम्म', 'हम', 'हम्म्', 'hmm', 'hm', 'hmmm', 'उम्म', 'mm'],
          'नहीं': ['नहीं', 'नही', 'nahi', 'nahin'], 'ठीक है': ['ठीक है', 'theek hai', 'thik hai', 'ठीक हैं'], 'बिल्कुल': ['बिल्कुल', 'बिलकुल', 'bilkul'],
          'अच्छा': ['अच्छा', 'achha', 'acha', 'accha'], 'हाँ बोलिए': ['हाँ बोलिए', 'हां बोलिए', 'हाँ बोलिये', 'haan boliye'], 'नहीं चाहिए': ['नहीं चाहिए', 'नहीं चाहिये', 'nahi chahiye'],
          'कल': ['कल', 'kal'], 'दो बजे': ['दो बजे', '2 बजे', 'do baje', '2 baje'], 'हैलो': ['हैलो', 'हेलो', 'hello', 'helo', 'हलो'], 'कौन': ['कौन', 'kaun', 'kon', 'कौन?'], 'चलेगा': ['चलेगा', 'chalega']}
def nrm(s):
  s = unicodedata.normalize('NFC', (s or '').lower())
  return ' '.join(''.join(' ' if unicodedata.category(c)[0] in 'PS' else c for c in s).split())
def script(s):
  sc = set()
  for c in s:
    if c.isalpha():
      n = unicodedata.name(c, '')
      sc.add('deva' if 'DEVANAGARI' in n else 'latin' if 'LATIN' in n else 'other')
  return sc
man = {r['uid']: r for r in csv.DictReader(open(os.path.join(RAW, 'shortset', 'manifest.csv'), encoding='utf-8'))}
srows = []; sdet = []
for f in sorted(glob.glob(os.path.join(RAW, 'asr_short', '*.jsonl'))):
  rs = [json.loads(l) for l in open(f, encoding='utf-8')]
  ok = 0; empty = 0; other = 0
  for r in rs:
    ref = man[r['uid']]['ref']; h = nrm(r.get('hyp'))
    good = h in [nrm(x) for x in ACCEPT[ref]]
    ok += good; empty += (h == ''); other += ('other' in script(h))
    sdet.append({'engine': r['engine'], 'uid': r['uid'], 'ref': ref, 'hyp': r.get('hyp'), 'correct': good})
  srows.append({'engine': rs[0]['engine'], 'band': 'nb', 'n': len(rs), 'correct': ok, 'empty': empty, 'non_latin_non_devanagari_script': other})
pd.DataFrame(srows).to_csv(os.path.join(RES, 'short_answer_summary.csv'), index=False)
pd.DataFrame(sdet).to_csv(os.path.join(RES, 'short_answer_per_clip.csv'), index=False)

# ---------- cost inputs for the economics lane ----------
warm = llm_sum[(llm_sum.cache_arm == 'warm') & (llm_sum.content_filter == 'default') & (llm_sum.run == 'main')]
asr = pd.read_csv(os.path.join(RES, 'asr_summary.csv'))
def wer(e, s, lang, band='nb'):
  x = asr[(asr.engine == e) & (asr.set == s) & (asr.lang == lang) & (asr.band == band)]
  return float(x.wer.iat[0]) if len(x) else None
TURNS_PER_MIN = 5.0; AGENT_TALK_S_PER_MIN = 24.0
tts_ws = tts_sum[tts_sum.arm == 'ws'].set_index('voice')
def stack(llm, voice, asr_usd_h, asr_name):
  w = warm[warm.model == llm].iloc[0]
  llm_min = w.cost_per_turn_usd_mean * TURNS_PER_MIN
  cps = float(tts_ws.loc[voice, 'chars_per_audio_s']); pr = tts_price(voice)
  tts_min = cps * AGENT_TALK_S_PER_MIN * pr / 1e6 if pr else None
  asr_min = asr_usd_h / 60
  tot = asr_min + llm_min + (tts_min or 0)
  return {'asr': asr_name, 'llm': llm, 'voice': voice, 'usd_per_min': {'asr': round(asr_min, 5), 'llm': round(llm_min, 5), 'tts': round(tts_min, 5) if tts_min else None, 'total_ai': round(tot, 5)},
          'inr_per_min_total_ai': round(tot * FX, 3)}
ci = {
  'lane': 'l8-azure-bench', 'generated': '2026-10-17', 'fx_inr_per_usd': FX,
  'method': 'Measured on Azure (southeastasia GlobalStandard; francecentral DataZone EU for gpt-6-*, DeepSeek-V4-Flash, gpt-4o-*-transcribe) from a container in Columbus, Ohio via an egress proxy; prices from the Azure Retail Prices API fetched 2026-10-17. Per-minute figures exclude telephony, infra, storage and margin.',
  'assumptions': {'llm_turns_per_connected_min': TURNS_PER_MIN, 'llm_turns_per_min_range': [3, 8], 'agent_talk_seconds_per_connected_min': AGENT_TALK_S_PER_MIN, 'agent_talk_range_s': [15, 35],
                  'asr_streams_whole_call': True, 'prompt_tokens_note': 'measured prompt ~1.6-1.7k tokens per turn incl. ~1.5k system + 1-3 short history turns; a real call grows ~60-100 tokens per turn of history'},
  'measured': {
    'llm_per_turn': {r.model: {'prompt_tokens_p50': int(r.prompt_tokens_p50), 'cached_share': r.cached_share, 'completion_tokens_p50': int(r.completion_tokens_p50),
                               'cost_inr_per_turn': r.cost_per_turn_inr_mean, 'cost_inr_per_turn_uncached': r.cost_per_turn_inr_if_uncached,
                               'ttft_p50_ms_from_ohio': int(r.ttft_p50_ms), 'server_ttft_est_p50_ms': int(r.server_ttft_est_p50_ms), 'n': int(r.n)} for r in warm.itertuples()},
    'tts_chars_per_audio_second': {v: float(r.chars_per_audio_s) for v, r in tts_ws.iterrows()},
    'tts_service_latency_p50_ms': {v: (None if pd.isna(r.service_latency_p50_ms) else int(r.service_latency_p50_ms)) for v, r in tts_ws.iterrows()},
    'asr_wer_nb_pct': {e: {'hi': wer(e, 'kathbath', 'hi'), 'ta': wer(e, 'kathbath', 'ta'), 'bn': wer(e, 'kathbath', 'bn'), 'mr': wer(e, 'kathbath', 'mr'), 'te': wer(e, 'kathbath', 'te'), 'en_IN': wer(e, 'nptel_en', 'en')}
                       for e in ('rt', 'fast', 'mai2', 'gpt4o', 'gpt4omini', 'rt_lid', 'fast_llm')},
    'rtt_ms_from_test_container': {'southeastasia': round(RTT_SEA), 'francecentral': round(RTT_FRC)},
  },
  'prices_usd': {
    'asr_per_hour': {'speech_realtime_s1': 1.00, 'speech_fast_transcription': 0.36, 'speech_fast_transcription_promo_from_2026_09_01': 0.10, 'speech_batch': 0.18,
                     'gpt_transcribe': 0.27, 'gpt_live_transcribe': 1.02, 'gpt_4o_transcribe_audio_per_1m_tokens': 6.0, 'gpt_4o_mini_transcribe_audio_per_1m_tokens': 3.0,
                     'mai_transcribe_2': 'not listed in Retail Prices API on 2026-10-17 (preview)'},
    'tts_per_1m_chars': {'neural': 15.0, 'neural_hd_dragon': 22.0, 'mai_voice_2_1': 'not listed (preview)', 'personal_voice': 24.0, 'neural_commit_80M_overage': 11.40},
    'llm_per_1m_tokens_in_cached_out': {k: list(v) for k, v in PRICE.items()},
    'llm_global_price_reference': {k: list(v) for k, v in GLOBAL_PRICE.items()},
  },
  'example_stacks_ai_only': [
    stack('gpt-4.1-mini', 'hi-IN-SwaraNeural', 1.00, 'speech realtime S1'),
    stack('gpt-5.4-nano', 'hi-IN-SwaraNeural', 1.00, 'speech realtime S1'),
    stack('gpt-6-luna(DZ-EU)', 'hi-IN-SwaraNeural', 1.00, 'speech realtime S1'),
    stack('gpt-6-luna(DZ-EU)', 'en-IN-Meera:DragonHDLatestNeural', 1.00, 'speech realtime S1'),
    stack('gpt-6-sol(DZ-EU)', 'en-IN-Meera:DragonHDLatestNeural', 1.00, 'speech realtime S1'),
    stack('DeepSeek-V4-Flash(DZ-EU)', 'hi-IN-SwaraNeural', 1.00, 'speech realtime S1'),
  ],
}
json.dump(ci, open(os.path.join(LANE, 'cost-inputs.json'), 'w'), indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
print(llm_sum.to_string()); print(pd.DataFrame(abrows).to_string()); print(tts_sum.to_string()); print(pd.DataFrame(srows).to_string())
print(json.dumps(ci['example_stacks_ai_only'], indent=0))
