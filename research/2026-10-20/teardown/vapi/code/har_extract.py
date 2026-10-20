"""Extract script bodies from a Playwright HAR into a directory (never executed). Usage: python3 -I har_extract.py <har> <outdir> <host-substring>"""
import json, sys, os, base64, urllib.parse, hashlib
har, out, hostsub = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
h = json.load(open(har))
n = 0; rows = []
for e in h['log']['entries']:
    u = e['request']['url']
    if hostsub not in u: continue
    c = e['response'].get('content', {})
    mt = c.get('mimeType', '')
    if 'javascript' not in mt and not u.split('?')[0].endswith('.js'): continue
    t = c.get('text')
    if t is None: continue
    b = base64.b64decode(t) if c.get('encoding') == 'base64' else t.encode('utf-8', 'surrogatepass')
    p = urllib.parse.urlparse(u).path.strip('/').replace('/', '__') or 'root'
    if not p.endswith('.js'): p += '.js'
    open(os.path.join(out, p), 'wb').write(b); n += 1
    rows.append((p, len(b), hashlib.sha256(b).hexdigest(), u))
json.dump(rows, open(os.path.join(out, '_index.json'), 'w'), indent=0)
print('extracted', n)
