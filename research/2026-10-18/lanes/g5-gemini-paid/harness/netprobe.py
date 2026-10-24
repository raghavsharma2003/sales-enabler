# g5-gemini-paid: network context for a vantage. DNS answer, TCP connect and TLS handshake time to the Gemini API host,
# n samples. No key is sent. Prints one JSON line per sample and a summary.
import json, socket, ssl, sys, time, statistics
HOST = 'generativelanguage.googleapis.com'
n = int(sys.argv[1]) if len(sys.argv) > 1 else 20
ips = sorted({a[4][0] for a in socket.getaddrinfo(HOST, 443, socket.AF_INET)})
tcp, tls = [], []
ctx = ssl.create_default_context()
for i in range(n):
    t0 = time.perf_counter()
    s = socket.create_connection((HOST, 443), timeout=10)
    t1 = time.perf_counter()
    ss = ctx.wrap_socket(s, server_hostname=HOST)
    t2 = time.perf_counter()
    ss.close()
    tcp.append((t1 - t0) * 1000); tls.append((t2 - t1) * 1000)
    time.sleep(0.2)
print(json.dumps({'host': HOST, 'ips': ips, 'n': n, 'tcp_ms_p50': round(statistics.median(tcp), 1), 'tcp_ms_min': round(min(tcp), 1),
                  'tls_ms_p50': round(statistics.median(tls), 1), 'note': 'tcp connect ~ 1 RTT to the nearest Google front end'}))
