# DNS / TCP / TLS handshake timing to the Gemini Live host (run from the India VM; through the sandbox proxy it is meaningless).
import socket, ssl, time, json, sys, statistics
HOST = 'generativelanguage.googleapis.com'
out = []
for i in range(int(sys.argv[1]) if len(sys.argv) > 1 else 20):
    t0 = time.perf_counter(); ai = socket.getaddrinfo(HOST, 443, socket.AF_INET, socket.SOCK_STREAM); t1 = time.perf_counter()
    ip = ai[0][4][0]
    s = socket.create_connection((ip, 443), timeout=10); t2 = time.perf_counter()
    ctx = ssl.create_default_context(); ss = ctx.wrap_socket(s, server_hostname=HOST); t3 = time.perf_counter()
    ss.close()
    out.append({'i': i, 'ip': ip, 'dns_ms': round((t1 - t0) * 1000, 2), 'tcp_ms': round((t2 - t1) * 1000, 2), 'tls_ms': round((t3 - t2) * 1000, 2)})
    time.sleep(0.3)
for r in out: print(json.dumps(r))
print('SUMMARY', json.dumps({k: statistics.median([r[k] for r in out]) for k in ('dns_ms', 'tcp_ms', 'tls_ms')}), 'ips', sorted(set(r['ip'] for r in out)))
