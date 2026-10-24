"""Probe watchlist candidate URLs: GET each, save body as baseline, record status/final url/bytes/sha256.
Usage: python3 -I probe.py <urls.tsv: vendor\tkind\turl> <out_dir> <out_csv>"""
import csv, hashlib, os, re, subprocess, sys, datetime

src, out_dir, out_csv = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out_dir, exist_ok=True)
rows = []
for line in open(src):
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    vendor, kind, url = line.split('\t')
    slug = re.sub(r'[^a-z0-9.]+', '_', url.split('://', 1)[1], flags=re.I).strip('_')[:150]
    path = os.path.join(out_dir, f'{vendor}__{kind}__{slug}')
    ts = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    cmd = ['curl', '-sS', '-L', '--max-time', '40', '-o', path, '-w', '%{http_code}\t%{url_effective}\t%{content_type}',
           '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', url]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        code, final, ctype = (r.stdout.split('\t') + ['', '', ''])[:3]
        err = r.stderr.strip()[:200]
    except Exception as e:  # noqa
        code, final, ctype, err = '', '', '', str(e)[:200]
    size = os.path.getsize(path) if os.path.exists(path) else 0
    sha = hashlib.sha256(open(path, 'rb').read()).hexdigest() if size else ''
    rows.append(dict(vendor=vendor, kind=kind, url=url, status=code, final_url=final, content_type=ctype,
                     bytes=size, sha256=sha, path=path, fetched_at=ts, error=err))
    print(vendor, kind, code, size, final[:90], err[:80], flush=True)
with open(out_csv, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)
