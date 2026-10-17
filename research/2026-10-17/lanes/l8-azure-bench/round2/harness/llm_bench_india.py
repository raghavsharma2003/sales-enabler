# r2-latency-india (2026-10-17): LLM time-to-first-token measured FROM the Central India VM.
# Same workload as round 1 (llm_prompt.py: ~1.6k-token Hinglish renewal agent, 36 caller turns), streaming,
# concurrency 1, arms interleaved round-robin in random order each round, warm keep-alive session per account.
# All deployments use the Asynchronous_filter content-filter policy (round 1 showed -188..-304 ms vs default).
# Usage: python llm_bench_india.py OUT_CSV ROUNDS [ONLY=comma list of arm names]
import os, sys, time, json, random, requests
from r2common import LLMS, KEYS, chat_url, Out, ts
from llm_prompt import messages, TURNS
def call(sess, name, i):
  acct, dep, extra, scope = LLMS[name]
  body = {'model': dep, 'messages': messages(i), 'stream': True, 'stream_options': {'include_usage': True}}; body.update(extra)
  h = {'api-key': KEYS[acct], 'Content-Type': 'application/json'}
  t0 = time.perf_counter(); t_first = t_last = t_hdr = None; text = []; usage = None; err = None; status = None; region = ''; tier = None; n = 0
  try:
    r = sess.post(chat_url(acct), headers=h, json=body, stream=True, timeout=60); status = r.status_code; t_hdr = time.perf_counter()
    region = r.headers.get('x-ms-region', '')
    if status != 200: err = r.text[:300]
    else:
      for line in r.iter_lines():
        if not line or not line.startswith(b'data:'): continue
        data = line[5:].strip()
        if data == b'[DONE]': break
        d = json.loads(data)
        if d.get('usage'): usage = d['usage']
        if d.get('service_tier'): tier = d['service_tier']
        for ch in d.get('choices') or []:
          c = (ch.get('delta') or {}).get('content')
          if c:
            now = time.perf_counter(); n += 1
            if t_first is None: t_first = now
            t_last = now; text.append(c)
  except Exception as e: err = repr(e)[:300]
  t_end = time.perf_counter(); u = usage or {}; ptd = u.get('prompt_tokens_details') or {}
  return {'ts': ts(), 'arm': name, 'scope': scope, 'deployment': dep, 'turn_idx': i % len(TURNS), 'status': status, 'x_ms_region': region, 'service_tier': tier,
          'ttfb_ms': round((t_hdr - t0) * 1e3, 1) if t_hdr else None, 'ttft_ms': round((t_first - t0) * 1e3, 1) if t_first else None,
          'total_ms': round((t_end - t0) * 1e3, 1), 'first_to_last_ms': round((t_last - t_first) * 1e3, 1) if t_first else None, 'chunks': n,
          'prompt_tokens': u.get('prompt_tokens'), 'cached_tokens': ptd.get('cached_tokens'), 'completion_tokens': u.get('completion_tokens'),
          'reply': ''.join(text).replace('\n', ' ')[:300], 'err': err}
if __name__ == '__main__':
  out = Out(sys.argv[1]); rounds = int(sys.argv[2]); only = os.environ.get('ONLY')
  names = [n for n in LLMS if not only or n in only.split(',')]
  sess = {a: requests.Session() for a in ('cin', 'sin', 'sea', 'frc')}
  for n in names: call(sess[LLMS[n][0]], n, 0)   # warm connections + prompt cache (not recorded)
  random.seed(29)
  for rd in range(rounds):
    order = names[:]; random.shuffle(order)
    for n in order:
      row = call(sess[LLMS[n][0]], n, rd); row['round'] = rd; out.row(row)
      print(rd, n, row['status'], row['x_ms_region'], row['service_tier'], row['ttft_ms'], row['total_ms'], row['cached_tokens'], (row['reply'] or row['err'] or '')[:60], flush=True)
