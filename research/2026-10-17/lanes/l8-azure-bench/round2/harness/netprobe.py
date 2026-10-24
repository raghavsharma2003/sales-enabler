# r2-latency-india (2026-10-17): network floor from the Central India VM to every endpoint the cascade uses.
# Cold arm: new connection each time -> DNS lookup, TCP connect, TLS handshake, HTTP first byte (invalid key -> 401).
# Warm arm: keep-alive requests.Session, same 401 request -> the floor that is added to every call on a warm connection.
# Usage: python netprobe.py OUT_CSV N
import socket, ssl, time, sys, requests, statistics as st
from r2common import Out, ts
HOSTS = {
  'cin-stt': ('centralindia.stt.speech.microsoft.com', 'GET', '/speech/recognition/conversation/cognitiveservices/v1?language=hi-IN'),
  'cin-tts': ('centralindia.tts.speech.microsoft.com', 'GET', '/cognitiveservices/voices/list'),
  'cin-acct (Voice Live)': ('vp-r2lat-cin.cognitiveservices.azure.com', 'POST', '/openai/deployments/x/chat/completions?api-version=2024-10-21'),
  'sin-aoai': ('vp-r2lat-sin.openai.azure.com', 'POST', '/openai/deployments/x/chat/completions?api-version=2024-10-21'),
  'sea-stt': ('southeastasia.stt.speech.microsoft.com', 'GET', '/speech/recognition/conversation/cognitiveservices/v1?language=hi-IN'),
  'sea-tts': ('southeastasia.tts.speech.microsoft.com', 'GET', '/cognitiveservices/voices/list'),
  'sea-aoai': ('vp-research-ai-sea.openai.azure.com', 'POST', '/openai/deployments/x/chat/completions?api-version=2024-10-21'),
  'frc-aoai': ('vp-research-ai-frc.openai.azure.com', 'POST', '/openai/deployments/x/chat/completions?api-version=2024-10-21'),
}
def cold(host, method, path):
  t0 = time.perf_counter(); ai = socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM); t1 = time.perf_counter()
  ip = ai[0][4][0]; s = socket.create_connection((ip, 443), timeout=10); t2 = time.perf_counter()
  ctx = ssl.create_default_context(); ss = ctx.wrap_socket(s, server_hostname=host); t3 = time.perf_counter()
  req = f'{method} {path} HTTP/1.1\r\nHost: {host}\r\nOcp-Apim-Subscription-Key: invalid\r\napi-key: invalid\r\nContent-Length: 2\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{{}}'
  ss.sendall(req.encode()); b = ss.recv(64); t4 = time.perf_counter(); ss.close()
  code = b.split(b' ')[1].decode() if b.startswith(b'HTTP') else '?'
  return {'ip': ip, 'dns_ms': (t1 - t0) * 1e3, 'tcp_ms': (t2 - t1) * 1e3, 'tls_ms': (t3 - t2) * 1e3, 'http_first_byte_ms': (t4 - t3) * 1e3, 'total_ms': (t4 - t0) * 1e3, 'status': code, 'tls_version': ss.version() if False else ''}
if __name__ == '__main__':
  out = Out(sys.argv[1]); n = int(sys.argv[2])
  for name, (host, m, path) in HOSTS.items():
    c = []
    for i in range(n):
      try: r = cold(host, m, path)
      except Exception as e: r = {'err': repr(e)[:200]}
      r.update({'ts': ts(), 'target': name, 'host': host, 'arm': 'cold', 'i': i}); out.row({k: (round(v, 2) if isinstance(v, float) else v) for k, v in r.items()}); c.append(r)
    sess = requests.Session(); url = f'https://{host}{path}'; h = {'Ocp-Apim-Subscription-Key': 'invalid', 'api-key': 'invalid', 'Content-Type': 'application/json'}
    sess.request(m, url, headers=h, data=b'{}', timeout=10)
    w = []
    for i in range(n):
      t0 = time.perf_counter(); r = sess.request(m, url, headers=h, data=b'{}', timeout=10); dt = (time.perf_counter() - t0) * 1e3; w.append(dt)
      out.row({'ts': ts(), 'target': name, 'host': host, 'arm': 'warm', 'i': i, 'ip': '', 'dns_ms': None, 'tcp_ms': None, 'tls_ms': None, 'http_first_byte_ms': round(dt, 2), 'total_ms': round(dt, 2), 'status': r.status_code})
    ok = [x for x in c if 'tcp_ms' in x]
    print(f"{name:24s} ip {ok[0]['ip'] if ok else '-'} tcp p50 {st.median([x['tcp_ms'] for x in ok]):6.1f}  tls p50 {st.median([x['tls_ms'] for x in ok]):6.1f}  cold total p50 {st.median([x['total_ms'] for x in ok]):6.1f}  warm req p50 {st.median(w):6.1f} status {r.status_code}", flush=True)
