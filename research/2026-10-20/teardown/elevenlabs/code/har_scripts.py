"""Export embedded JS bodies from a HAR to a new directory (data only; never executed).
Usage: python3 -I har_scripts.py <har> <outdir> [host-substring]"""
import json, sys, os, base64, hashlib, urllib.parse
har, out = sys.argv[1], sys.argv[2]; hostsub = sys.argv[3] if len(sys.argv) > 3 else ''
os.makedirs(out, exist_ok=False)
idx = []
for e in json.load(open(har))['log']['entries']:
    u = e['request']['url']; c = e['response'].get('content', {})
    mt = (c.get('mimeType') or '')
    if 'javascript' not in mt and not u.split('?')[0].endswith('.js'): continue
    if hostsub and hostsub not in urllib.parse.urlparse(u).netloc: continue
    t = c.get('text')
    if not t: continue
    b = base64.b64decode(t) if c.get('encoding') == 'base64' else t.encode()
    name = hashlib.sha1(u.encode()).hexdigest()[:12] + '_' + os.path.basename(urllib.parse.urlparse(u).path)[:60]
    open(os.path.join(out, name), 'wb').write(b)
    idx.append({'file': name, 'url': u, 'bytes': len(b), 'has_sourcemap_ref': b'sourceMappingURL' in b[-300:]})
json.dump(idx, open(os.path.join(out, '_index.json'), 'w'), indent=1)
print(len(idx), 'scripts', sum(i['bytes'] for i in idx), 'bytes', sum(i['has_sourcemap_ref'] for i in idx), 'with sourceMappingURL')
