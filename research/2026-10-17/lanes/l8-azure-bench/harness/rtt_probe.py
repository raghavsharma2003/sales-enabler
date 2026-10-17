# RTT probe: warm keep-alive HTTPS requests that the Azure front end answers without model work
# (404 for a non-existent deployment / path). Median of n gives the network+front-door floor that
# is subtracted from TTFT/TTFB. Usage: python rtt_probe.py OUT_CSV LABEL [n]
import os, sys, time, csv, requests, statistics as st
out, label = sys.argv[1], sys.argv[2]; n = int(sys.argv[3]) if len(sys.argv) > 3 else 30
key = os.environ['VP_AI_KEY']
targets = {
  'sea-aoai-404': ('POST', os.environ['VP_AI_ENDPOINT'].rstrip('/') + '/openai/deployments/no-such-deployment/chat/completions?api-version=2024-10-21', {'api-key': key, 'Content-Type': 'application/json'}, b'{}'),
  'sea-aoai-401': ('POST', os.environ['VP_AI_ENDPOINT'].rstrip('/') + '/openai/deployments/no-such-deployment/chat/completions?api-version=2024-10-21', {'api-key': 'invalid', 'Content-Type': 'application/json'}, b'{}'),
  'sea-tts-host': ('GET', 'https://southeastasia.tts.speech.microsoft.com/cognitiveservices/voices/list?x=1', {'Ocp-Apim-Subscription-Key': 'invalid'}, None),
  'sea-stt-host': ('GET', 'https://southeastasia.stt.speech.microsoft.com/', {}, None),
}
extra = os.environ.get('EXTRA_ENDPOINT')
if extra:
  targets['extra-aoai-404'] = ('POST', extra.rstrip('/') + '/openai/deployments/no-such-deployment/chat/completions?api-version=2024-10-21', {'api-key': 'invalid', 'Content-Type': 'application/json'}, b'{}')
rows = []
for name, (m, url, h, body) in targets.items():
  s = requests.Session()
  s.request(m, url, headers=h, data=body, timeout=20)  # warm the tunnel
  ts = []
  for i in range(n):
    t0 = time.perf_counter(); r = s.request(m, url, headers=h, data=body, timeout=20); dt = (time.perf_counter() - t0) * 1000
    ts.append(dt); rows.append({'label': label, 'target': name, 'i': i, 'status': r.status_code, 'ms': round(dt, 1), 'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
  ts.sort(); print(name, 'n', n, 'status', r.status_code, 'p50', round(st.median(ts), 1), 'p10', round(ts[int(0.1*n)], 1), 'p90', round(ts[int(0.9*n)-1], 1))
new = not os.path.exists(out)
with open(out, 'a', newline='') as f:
  w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
  if new: w.writeheader()
  w.writerows(rows)
