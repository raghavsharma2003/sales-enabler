# LLM latency/cost bench for a Hinglish sales turn (l8-azure-bench, 2026-10-17).
# Streams chat completions from Azure (OpenAI v1-compatible route on the AIServices accounts), sequential
# (concurrency 1), models interleaved round-robin so time-of-day drift hits every model equally.
# Records: TTFT (request sent -> first non-empty content delta), total time, output tokens, cached tokens,
# decode tokens/s, and the reply text. Network RTT is measured separately (rtt_probe.py) and subtracted later.
# Usage: python llm_bench.py OUT_CSV ROUNDS [cold_every]   (env: VP_AI_KEY, FRC_KEY)
import os, sys, time, json, csv, uuid, random, requests
sys.path.insert(0, os.path.dirname(__file__))
from llm_prompt import messages, TURNS

SEA = 'https://vp-research-ai-sea.openai.azure.com/openai/v1/chat/completions'
FRC = 'https://vp-research-ai-frc.openai.azure.com/openai/v1/chat/completions'
# name -> (endpoint, key env, deployment, extra params)
MODELS = {
  'gpt-4.1-mini':        (SEA, 'VP_AI_KEY', 'l8-gpt-4-1-mini', {'max_tokens': 120, 'temperature': 0.4}),
  'gpt-4.1-nano':        (SEA, 'VP_AI_KEY', 'l8-gpt-4-1-nano', {'max_tokens': 120, 'temperature': 0.4}),
  'gpt-5.4-mini':        (SEA, 'VP_AI_KEY', 'l8-gpt-5-4-mini', {'max_completion_tokens': 300, 'reasoning_effort': 'none'}),
  'gpt-5.4-nano':        (SEA, 'VP_AI_KEY', 'l8-gpt-5-4-nano', {'max_completion_tokens': 300, 'reasoning_effort': 'none'}),
  'Llama-3.3-70B':       (SEA, 'VP_AI_KEY', 'l8-llama-3-3-70b', {'max_tokens': 120, 'temperature': 0.4}),
  'Phi-4':               (SEA, 'VP_AI_KEY', 'l8-phi-4', {'max_tokens': 120, 'temperature': 0.4}),
  'gpt-oss-120b':        (SEA, 'VP_AI_KEY', 'l8-gpt-oss-120b', {'max_tokens': 600, 'reasoning_effort': 'low'}),
  'DeepSeek-V4.1-Flash': (SEA, 'VP_AI_KEY', 'l8-deepseek-v4-1-flash', {'max_tokens': 120, 'temperature': 0.4}),
  'gpt-6-luna(DZ-EU)':   (FRC, 'FRC_KEY', 'l8-gpt-6-luna-dz', {'max_completion_tokens': 300, 'reasoning_effort': 'none'}),
  'gpt-6-sol(DZ-EU)':    (FRC, 'FRC_KEY', 'l8-gpt-6-sol-dz', {'max_completion_tokens': 300, 'reasoning_effort': 'none'}),
  'DeepSeek-V4-Flash(DZ-EU)': (FRC, 'FRC_KEY', 'l8-deepseek-v4-flash-dz', {'max_tokens': 120, 'temperature': 0.4}),
  # same models behind a custom content-filter policy with mode Asynchronous_filter (same thresholds as DefaultV2)
  'gpt-4.1-mini+async':  (SEA, 'VP_AI_KEY', 'l8-gpt-4-1-mini-async', {'max_tokens': 120, 'temperature': 0.4}),
  'gpt-5.4-nano+async':  (SEA, 'VP_AI_KEY', 'l8-gpt-5-4-nano-async', {'max_completion_tokens': 300, 'reasoning_effort': 'none'}),
  'gpt-5.4-mini+async':  (SEA, 'VP_AI_KEY', 'l8-gpt-5-4-mini-async', {'max_completion_tokens': 300, 'reasoning_effort': 'none'}),
  'Llama-3.3-70B+async': (SEA, 'VP_AI_KEY', 'l8-llama-3-3-70b-async', {'max_tokens': 120, 'temperature': 0.4}),
  'gpt-6-luna(DZ-EU)+async': (FRC, 'FRC_KEY', 'l8-gpt-6-luna-dz-async', {'max_completion_tokens': 300, 'reasoning_effort': 'none'}),
  'DeepSeek-V4-Flash(DZ-EU)+async': (FRC, 'FRC_KEY', 'l8-deepseek-v4-flash-dz-async', {'max_tokens': 120, 'temperature': 0.4}),
}

def call(sess, name, i, cold):
  ep, kenv, dep, extra = MODELS[name]
  nonce = uuid.uuid4().hex[:12] if cold else None
  body = {'model': dep, 'messages': messages(i, nonce), 'stream': True, 'stream_options': {'include_usage': True}}
  body.update(extra)
  h = {'api-key': os.environ[kenv], 'Content-Type': 'application/json'}
  t0 = time.perf_counter(); t_first = None; t_last = None; text = []; usage = None; err = None; status = None; region = None; nchunks = 0
  try:
    r = sess.post(ep, headers=h, json=body, stream=True, timeout=60)
    status = r.status_code; region = r.headers.get('x-ms-region') or r.headers.get('azureml-model-deployment') or ''
    t_hdr = time.perf_counter()
    if status != 200:
      err = r.text[:300]
    else:
      for line in r.iter_lines():
        if not line or not line.startswith(b'data:'): continue
        data = line[5:].strip()
        if data == b'[DONE]': break
        d = json.loads(data)
        if d.get('usage'): usage = d['usage']
        for ch in d.get('choices') or []:
          c = (ch.get('delta') or {}).get('content')
          if c:
            nchunks += 1
            now = time.perf_counter()
            if t_first is None: t_first = now
            t_last = now; text.append(c)
  except Exception as e:
    err = repr(e)[:300]; t_hdr = None
  t_end = time.perf_counter()
  u = usage or {}
  ptd = u.get('prompt_tokens_details') or {}
  ctd = u.get('completion_tokens_details') or {}
  out_tok = u.get('completion_tokens')
  dec = None
  if t_first and t_last and out_tok and t_last > t_first and nchunks > 1:
    dec = (out_tok - (ctd.get('reasoning_tokens') or 0) - 1) / (t_last - t_first)
  return {
    'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'model': name, 'deployment': dep, 'endpoint': ep.split('/')[2],
    'turn_idx': i % len(TURNS), 'cache_arm': 'cold' if cold else 'warm', 'status': status, 'x_ms_region': region,
    'ttfb_ms': round((t_hdr - t0) * 1000, 1) if t_hdr else None,
    'ttft_ms': round((t_first - t0) * 1000, 1) if t_first else None,
    'total_ms': round((t_end - t0) * 1000, 1),
    'prompt_tokens': u.get('prompt_tokens'), 'cached_tokens': ptd.get('cached_tokens'),
    'completion_tokens': out_tok, 'reasoning_tokens': ctd.get('reasoning_tokens'),
    'decode_tok_s': round(dec, 1) if dec else None, 'chunks': nchunks,
    'first_to_last_ms': round((t_last - t_first) * 1000, 1) if t_first and t_last else None,
    'reply': ''.join(text).replace('\n', ' ')[:400], 'err': err,
  }

if __name__ == '__main__':
  out = sys.argv[1]; rounds = int(sys.argv[2]); cold_every = int(sys.argv[3]) if len(sys.argv) > 3 else 0
  only = os.environ.get('ONLY')
  names = [n for n in MODELS if not only or n in only.split(',')]
  sessions = {n: requests.Session() for n in names}
  new = not os.path.exists(out)
  f = open(out, 'a', newline=''); w = None
  random.seed(17)
  for rd in range(rounds):
    order = names[:]; random.shuffle(order)
    for n in order:
      cold = bool(cold_every) and (rd % cold_every == cold_every - 1)
      row = call(sessions[n], n, rd, cold)
      row['round'] = rd
      if w is None:
        w = csv.DictWriter(f, fieldnames=list(row.keys()))
        if new: w.writeheader()
      w.writerow(row); f.flush()
      print(rd, n, row['cache_arm'], row['status'], row['ttft_ms'], row['total_ms'], row['prompt_tokens'], row['cached_tokens'], row['completion_tokens'], (row['reply'] or row['err'] or '')[:90], flush=True)
