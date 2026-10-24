"""manifest.csv: path,bytes,sha256,source_url,fetched_at for every file under data/teardown/radar.
Usage: python3 -I build_manifest.py <repo_root> <out_csv>"""
import csv, datetime, glob, hashlib, json, os, sys
root, out = sys.argv[1], sys.argv[2]
base = os.path.join(root, 'data/teardown/radar')
src = {}
for jf in glob.glob(os.path.join(base, '*', 'web', '*.json')):
    try:
        r = json.load(open(jf))
    except Exception:
        continue
    stem = jf[:-5]
    for ext, label in (('.json', 'Playwright page record of '), ('.txt', 'rendered text of '), ('.har', 'Playwright HAR (content omitted) of ')):
        src[stem + ext] = (label + r.get('url', ''), r.get('fetched_at', ''))
for pc in glob.glob(os.path.join(base, '*', 'probe*.csv')):
    for r in csv.DictReader(open(pc)):
        if r.get('path'):
            src[r['path']] = (r['url'], r['fetched_at'])
rows = []
for p in sorted(glob.glob(os.path.join(base, '**', '*'), recursive=True)):
    if not os.path.isfile(p):
        continue
    b = open(p, 'rb').read()
    url, ts = src.get(p, ('', ''))
    if not url:
        mt = datetime.datetime.fromtimestamp(os.path.getmtime(p), datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        if '/_rea/sanitized-har/' in p:
            url = 'derived: copy of ozonetel/web/ozonetel.com.har with 4 URLs percent-encoded (har_sanitize.py)'
        elif '/_rea/' in p:
            url = 'derived: rea-agents 6.7.0 inspect-web-network-capture on _rea/sanitized-har/ozonetel.com.har'
        elif os.path.basename(p).startswith('probe'):
            url = 'derived: probe log (curl status, final url, bytes, sha256)'
        else:
            url = 'derived'
        ts = mt
    rows.append(dict(path=os.path.relpath(p, root), bytes=len(b), sha256=hashlib.sha256(b).hexdigest(), source_url=url, fetched_at=ts))
with open(out, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['path', 'bytes', 'sha256', 'source_url', 'fetched_at'])
    w.writeheader(); w.writerows(rows)
print(len(rows), 'files', sum(r['bytes'] for r in rows), 'bytes;', sum(1 for r in rows if r['source_url'].startswith('derived')), 'derived')
