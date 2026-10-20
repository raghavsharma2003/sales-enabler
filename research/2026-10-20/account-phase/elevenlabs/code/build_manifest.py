#!/usr/bin/env python3 -I
import os, csv, hashlib, datetime
ROOT = '/home/user/sales-enabler/'
D = 'data/account-phase/elevenlabs/'
rows = []
def src(rel):
    if rel.startswith(D + 'api-reads/'):
        if 'shared-voices' in rel: return 'https://api.elevenlabs.io/v1/shared-voices public voice-library query with our API key (read-only)'
        return 'https://api.elevenlabs.io read-only GET/calculator call with our API key (xi-api-key header)'
    if rel.startswith(D + 'api-writes/payloads/'): return 'request body authored by us (synthetic data) and sent to api.elevenlabs.io'
    if rel.startswith(D + 'api-writes/'): return 'https://api.elevenlabs.io create/update/read-back of synthetic probe objects with our API key (objects deleted afterwards)'
    if rel.startswith(D + 'cleanup/'): return 'https://api.elevenlabs.io DELETE/verify calls removing our synthetic probe objects'
    if rel.startswith(D + 'openapi/'): return 'https://api.elevenlabs.io/openapi.json public OpenAPI'
    if rel.startswith(D + 'derived/'): return 'derived locally by research/2026-10-20/account-phase/elevenlabs/code/derive_*.py from the saved API responses and OpenAPI'
    if rel.startswith(D + 'rea/'): return 'rea-agents analyze-javascript-application on the unpacked public @elevenlabs/client 1.29.0 dist (local static analysis, nothing executed)'
    if '/sdk/' in rel or rel.startswith(D + 'sdk/'):
        return 'npm pack / pip download of the published package (not installed, not executed), unpacked with tar/zipfile'
    return 'local'
def add(rel):
    p = ROOT + rel
    h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    t = datetime.datetime.fromtimestamp(os.path.getmtime(p), datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    rows.append([rel, os.path.getsize(p), h, src(rel), t])
for dp, dn, fn in os.walk(ROOT + D):
    rel_dir = os.path.relpath(dp, ROOT)
    # skip the bulky unpacked JS SDK tree except two small files; include everything else
    if rel_dir.startswith(D + 'sdk/npm-elevenlabs-js/unpacked'):
        continue
    for f in fn:
        add(os.path.join(rel_dir, f))
js = D + 'sdk/npm-elevenlabs-js/unpacked/package/'
for f in ('AGENTS.md', 'package.json'):
    if os.path.exists(ROOT + js + f): add(js + f)
rows.sort()
out = ROOT + 'research/2026-10-20/account-phase/elevenlabs/manifest.csv'
with open(out, 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['path', 'bytes', 'sha256', 'source', 'fetched_at']); w.writerows(rows)
print(len(rows), 'files,', sum(r[1] for r in rows), 'bytes')
