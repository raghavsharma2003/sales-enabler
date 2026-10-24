# g3-cascade-measured (2026-10-18): component benches run ON the Central India VM.
#   python component_bench.py llm OUT_CSV ROUNDS ARM [ARM ...]     -> streaming TTFT / total / usage per call, arms interleaved
#   python component_bench.py tts OUT_CSV ROUNDS ARM [ARM ...]     -> TTS time to first audio, RTF, underrun check
# LLM workload: round-1/2 renewal prompt (llm_prompt.SYSTEM, ~1.6k tokens) + the reply-shape note the cascade uses, with
# the 36 fixed Hinglish/Bhojpuri/Tamil-English turns cycled (warm prompt, like a live call). Gemini arms are paced to
# respect the free-tier per-minute limits; a 429 is recorded and backed off, never retried with another key.
import os, sys, time, random, json
from backends import llm_stream, gemini_tts_stream, Out, ts, Synth, az_ssml, sp
from llm_prompt import SYSTEM, FIRST, TURNS
from cascade3 import SYS
from tts_texts import TEXTS

def msgs(i):
  hist, user = TURNS[i % len(TURNS)]
  m = [{'role': 'system', 'content': SYS}, {'role': 'assistant', 'content': FIRST}]
  for u, a in hist: m += [{'role': 'user', 'content': u}, {'role': 'assistant', 'content': a}]
  return m + [{'role': 'user', 'content': user}]
last_call = {}
def pace(arm, gap):
  w = last_call.get(arm, 0) + gap - time.time()
  if w > 0: time.sleep(w)
  last_call[arm] = time.time()
def bench_llm(out, rounds, arms):
  for a in arms:   # warm each connection once (not recorded)
    try: list(llm_stream(a, msgs(0), max_tokens=20))
    except Exception as e: print('warm fail', a, e)
  backoff = {}
  for rd in range(rounds):
    order = arms[:]; random.shuffle(order)
    for a in order:
      if backoff.get(a, 0) > time.time(): continue
      if a.startswith('gm:'): pace(a, 6.5)
      u = {}; t = {}; txt = ''.join(llm_stream(a, msgs(rd), usage=u, timing=t))
      row = {'ts': ts(), 'round': rd, 'arm': a, 'turn': rd % len(TURNS), 'status': t.get('status'),
             'ttft_ms': round((t['first'] - t['req']) * 1e3, 1) if 'first' in t else None, 'total_ms': round((t['done'] - t['req']) * 1e3, 1) if 'done' in t else None,
             'prompt_tokens': u.get('prompt_tokens'), 'cached_tokens': u.get('cached_tokens'), 'completion_tokens': u.get('completion_tokens'), 'thought_tokens': u.get('thought_tokens'),
             'or_cost_usd': u.get('or_cost_usd'), 'provider': u.get('provider'), 'reply': txt.replace('\n', ' ')[:160], 'err': (t.get('err') or '')[:300]}
      out.row(row); print(rd, a, row['status'], row['ttft_ms'], row['total_ms'], row['prompt_tokens'], row['cached_tokens'], row['completion_tokens'], '|', row['reply'][:50], row['err'][:120], flush=True)
      if row['status'] == 429: backoff[a] = time.time() + 65
SHORT = 'जी, समझ गई।'
def bench_tts(out, rounds, arms):
  texts = TEXTS['hinglish']; random.seed(7)
  syn = {}
  for a in arms:
    if a.startswith('az:'): syn[a] = Synth(a[3:])
  backoff = {}
  for rd in range(rounds):
    order = arms[:]; random.shuffle(order)
    for a in order:
      t = SHORT if rd % 5 == 4 else texts[rd % len(texts)]
      row = {'ts': ts(), 'round': rd, 'arm': a, 'chars': len(t), 'kind': 'short' if t == SHORT else 'sentence'}
      if a.startswith('az:'):
        s = syn[a]; first = [None]; arrivals = []
        def cb(e, first=first, arrivals=arrivals):
          now = time.perf_counter(); arrivals.append((now, len(e.result.audio_data)))
          if first[0] is None: first[0] = now
        s.s.synthesizing.disconnect_all(); s.s.synthesizing.connect(cb)
        t0 = time.perf_counter(); r = s.s.speak_ssml_async(az_ssml(a[3:], t)).get(); t1 = time.perf_counter()
        ok = r.reason == sp.ResultReason.SynthesizingAudioCompleted
        row.update({'status': 200 if ok else 'fail', 'ttfb_ms': round((first[0] - t0) * 1e3, 1) if first[0] else None, 'total_ms': round((t1 - t0) * 1e3, 1),
                    'audio_s': round(len(r.audio_data) / 8000, 3) if ok else None, 'err': '' if ok else str(r.cancellation_details.error_details)[:200]})
        sec_per_byte = 1 / 8000
      else:
        if backoff.get(a.split(':')[1], 0) > time.time(): continue
        pace(a.split(':')[1], 21)   # free tier: ~3 requests/min/model observed
        arrivals = []
        info = gemini_tts_stream(a, t, 'warm, friendly' if a.startswith('gi:') else None, lambda b, f: arrivals.append((time.perf_counter(), len(b))))   # gg reads a style prefix aloud
        sec_per_byte = 1 / 8000 if a.startswith('gi:') else 1 / 48000
        row.update({'status': info.get('status'), 'ttfb_ms': round((info['first'] - info['req']) * 1e3, 1) if 'first' in info else None,
                    'hdr_ms': round((info['hdr'] - info['req']) * 1e3, 1) if 'hdr' in info else None, 'total_ms': round((info['done'] - info['req']) * 1e3, 1),
                    'audio_s': round(info.get('audio_s') or 0, 3), 'in_tokens': info.get('in_tokens'), 'out_tokens': info.get('out_tokens'), 'err': (info.get('err') or '')[:300]})
        if info.get('status') == 429: backoff[a.split(':')[1]] = time.time() + 65
      # underrun: if playback starts at the first chunk, does any chunk arrive after the audio before it has finished?
      if arrivals:
        tf = arrivals[0][0]; cum = 0.0; worst = 0.0
        for tt, n in arrivals:
          worst = max(worst, (tt - tf) - cum); cum += n * sec_per_byte
        row['max_underrun_ms'] = round(worst * 1e3, 1)
        if row.get('audio_s') and row.get('ttfb_ms') is not None: row['rtf'] = round((row['total_ms'] / 1e3) / row['audio_s'], 3)
      out.row(row); print(rd, a, row.get('status'), row.get('ttfb_ms'), row.get('total_ms'), row.get('audio_s'), row.get('max_underrun_ms'), row.get('err', '')[:120], flush=True)
if __name__ == '__main__':
  mode, out, rounds, arms = sys.argv[1], Out(sys.argv[2]), int(sys.argv[3]), sys.argv[4:]
  random.seed(11)
  if mode == 'llm': bench_llm(out, rounds, arms)
  else: bench_tts(out, rounds, arms)
