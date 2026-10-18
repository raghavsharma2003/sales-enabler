# g3-cascade-measured (2026-10-18): COMPUTED (not end-to-end measured) cost of component combinations under price levers,
# from the measured per-exchange LLM usage (results/cascade_usage_per_exchange.csv) and list / commitment prices
# (results/cost_inputs.csv). Reference call: 3 minutes, 5 exchanges/min, caller talking 40% of the time, 300 characters
# of agent text per minute (about 24-30 s of agent speech at the measured 10-12.5 chars/s), FX 95.
# Usage: python3 levers.py RESULTS_DIR
import csv, sys, os
D = sys.argv[1]; FX = 95.0; L = 3; EPM = 5; N = L * EPM; CHARS_MIN = 300; CALLER_SHARE = .40
U = {r['config']: r for r in csv.DictReader(open(os.path.join(D, 'cascade_usage_per_exchange.csv')))}
def llm_cost(cfg, pin, pc, pout):
  u = U[cfg]; base = float(u['prompt_base_tokens']); g = float(u['prompt_growth_tokens_per_exchange']); w = float(u['llm_waste_factor']); c = float(u['cached_share'])
  o = float(u['completion_tokens_per_exchange']); usd = 0
  for k in range(1, N + 1):
    p = (base + g * (k - 1)) * w; usd += (p * (1 - c) * pin + p * c * pc) / 1e6
  return (usd + N * o * pout / 1e6) / L   # per minute
GEM_CPS = 12.49   # Gemini 3.8 TTS Despina, measured chars/s over the six styled samples
STT = {   # USD per connected minute
  'Azure real-time PAYG, full stream': 1.00 / 60,
  'Azure real-time PAYG, VAD-gated (caller 40% x 1.25)': 1.00 / 60 * CALLER_SHARE * 1.25,
  'Azure real-time 100K-h commitment, full stream': 0.40 / 60,
  'Azure real-time 100K-h commitment, VAD-gated': 0.40 / 60 * CALLER_SHARE * 1.25,
  'gemini-3.5-transcribe-live, full stream (+final text)': 60 * 25 * 3.5e-6 + EPM * 14.6 * 21e-6,
  'gemini-3.5-transcribe-live, VAD-gated (+final text)': 60 * 25 * 3.5e-6 * CALLER_SHARE * 1.25 + EPM * 14.6 * 21e-6,
  'gemini-3.5-transcribe-live, full stream, text at published $0.004/min': 60 * 25 * 3.5e-6 + 0.004,
}
LLM = {
  'gpt-oss-120b on Groq via OpenRouter (C6 usage)': llm_cost('C6_gtl_or_azneural', 0.15, 0.075, 0.60),
  'gpt-4.1-mini South India Standard (C1 usage)': llm_cost('C1_az_az41_azneural', 0.44, 0.11, 1.76),
  'gemini-3.5-flash-lite, no cache hits as measured (C7 usage)': llm_cost('C7_az_gm_azneural', 0.30, 0.03, 2.50),
}
def llm_cost_c(cfg, pin, pc, pout, cached):
  u = dict(U[cfg]); u['cached_share'] = str(cached); U['_tmp'] = u; v = llm_cost('_tmp', pin, pc, pout); del U['_tmp']; return v
LLM['gemini-3.5-flash-lite, if 90% of prompt were cache hits (C7 usage)'] = llm_cost_c('C7_az_gm_azneural', 0.30, 0.03, 2.50, 0.9)
TTS = {
  'Azure neural PAYG ($15/1M chars)': CHARS_MIN * 15e-6,
  'Azure neural 2000M-char commitment ($7.50/1M)': CHARS_MIN * 7.5e-6,
  'Azure DragonHD PAYG ($22/1M chars)': CHARS_MIN * 22e-6,
  'gemini-3.8-flash-lite-tts to 2026-12-31 ($6/1M audio tok)': CHARS_MIN / GEM_CPS * 25 * 6e-6 + EPM * 30 * 0.5e-6,
  'gemini-3.8-flash-lite-tts from 2027-01-01 ($12/1M)': CHARS_MIN / GEM_CPS * 25 * 12e-6 + EPM * 30 * 1.0e-6,
  'gemini-3.8-flash-tts to 2026-12-31 ($9/1M)': CHARS_MIN / GEM_CPS * 25 * 9e-6 + EPM * 30 * 0.5e-6,
  'gemini-3.8-flash-tts from 2027-01-01 ($18/1M)': CHARS_MIN / GEM_CPS * 25 * 18e-6 + EPM * 30 * 1.0e-6,
}
rows = []
for k, v in STT.items(): rows.append({'layer': 'STT', 'option': k, 'inr_per_min': round(v * FX, 3)})
for k, v in LLM.items(): rows.append({'layer': 'LLM', 'option': k, 'inr_per_min': round(v * FX, 3)})
for k, v in TTS.items(): rows.append({'layer': 'TTS', 'option': k, 'inr_per_min': round(v * FX, 3)})
combos = [
  ('Measured-latency stack C6 at PAYG', 'gemini-3.5-transcribe-live, full stream (+final text)', 'gpt-oss-120b on Groq via OpenRouter (C6 usage)', 'Azure neural PAYG ($15/1M chars)'),
  ('C6 + VAD-gated STT', 'gemini-3.5-transcribe-live, VAD-gated (+final text)', 'gpt-oss-120b on Groq via OpenRouter (C6 usage)', 'Azure neural PAYG ($15/1M chars)'),
  ('C6 + VAD-gated STT + neural commitment', 'gemini-3.5-transcribe-live, VAD-gated (+final text)', 'gpt-oss-120b on Groq via OpenRouter (C6 usage)', 'Azure neural 2000M-char commitment ($7.50/1M)'),
  ('Azure STT commitment gated + gpt-oss + neural commitment', 'Azure real-time 100K-h commitment, VAD-gated', 'gpt-oss-120b on Groq via OpenRouter (C6 usage)', 'Azure neural 2000M-char commitment ($7.50/1M)'),
  ('All-Gemini (transcribe-live + 3.5 flash-lite + 3.8 flash-lite TTS), 2026 prices', 'gemini-3.5-transcribe-live, full stream (+final text)', 'gemini-3.5-flash-lite, no cache hits as measured (C7 usage)', 'gemini-3.8-flash-lite-tts to 2026-12-31 ($6/1M audio tok)'),
  ('All-Gemini, VAD-gated STT, cache hits, 2026 prices', 'gemini-3.5-transcribe-live, VAD-gated (+final text)', 'gemini-3.5-flash-lite, if 90% of prompt were cache hits (C7 usage)', 'gemini-3.8-flash-lite-tts to 2026-12-31 ($6/1M audio tok)'),
  ('All-Gemini, VAD-gated STT, cache hits, 2027 TTS prices', 'gemini-3.5-transcribe-live, VAD-gated (+final text)', 'gemini-3.5-flash-lite, if 90% of prompt were cache hits (C7 usage)', 'gemini-3.8-flash-lite-tts from 2027-01-01 ($12/1M)'),
  ('All-Gemini with 3.8 flash TTS, 2026 prices', 'gemini-3.5-transcribe-live, full stream (+final text)', 'gemini-3.5-flash-lite, no cache hits as measured (C7 usage)', 'gemini-3.8-flash-tts to 2026-12-31 ($9/1M)'),
  ('Mixed: Azure STT PAYG + gpt-oss + Gemini flash-lite TTS', 'Azure real-time PAYG, full stream', 'gpt-oss-120b on Groq via OpenRouter (C6 usage)', 'gemini-3.8-flash-lite-tts to 2026-12-31 ($6/1M audio tok)'),
  ('Round-2 India baseline (C1) at PAYG', 'Azure real-time PAYG, full stream', 'gpt-4.1-mini South India Standard (C1 usage)', 'Azure neural PAYG ($15/1M chars)'),
  ('Expressive Azure: C1 with DragonHD', 'Azure real-time PAYG, full stream', 'gpt-4.1-mini South India Standard (C1 usage)', 'Azure DragonHD PAYG ($22/1M chars)'),
]
for name, s, l, t in combos:
  rows.append({'layer': 'COMBO (computed)', 'option': name, 'inr_per_min': round((STT[s] + LLM[l] + TTS[t]) * FX, 3), 'stt': s, 'llm': l, 'tts': t})
keys = ['layer', 'option', 'inr_per_min', 'stt', 'llm', 'tts']
with open(os.path.join(D, 'cost_levers.csv'), 'w', newline='') as fh:
  w = csv.DictWriter(fh, fieldnames=keys); w.writeheader(); [w.writerow(r) for r in rows]
for r in rows: print(f"| {r['layer']} | {r['option']} | {r['inr_per_min']} |")
