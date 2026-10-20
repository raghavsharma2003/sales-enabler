"""Verifier check (2026-10-20): unique-path dedupe of bundle routes vs public OpenAPI. Usage: python3 -I verify_bundle_check.py <app-js dir> <openapi.json>"""
import re, glob, json, sys, collections
jsdir, oapi = sys.argv[1], sys.argv[2]
paths = collections.defaultdict(set)
for f in glob.glob(jsdir + '/*.js'):
    t = open(f, errors='ignore').read()
    for m in re.finditer(r'url:"(/v[0-9]/[^"]+)",method:"(get|post|put|patch|delete)"', t): paths[m.group(1)].add(m.group(2).upper())
    for m in re.finditer(r'path:"(/v[0-9]/[^"]+)",operationId:"([A-Za-z0-9_]+)"', t): paths[m.group(1)].add('?')
norm = lambda p: re.sub(r'\{[^}]+\}', '{}', p).rstrip('/')
pub = {norm(p) for p in json.load(open(oapi))['paths']}
scoped = {p for p in paths if p.startswith('/v1/convai') or p.startswith('/v1/speech-engine')}
scoped_n = {norm(p) for p in scoped}
unpub_n = {p for p in scoped_n if p not in pub}
print('unique bundle paths', len(paths), 'scoped unique (norm)', len(scoped_n), 'unpublished unique (norm)', len(unpub_n))
# also: published convai paths missing from bundle
pubconv = {p for p in pub if p.startswith('/v1/convai')}
print('public convai paths', len(pubconv), 'of which in bundle', len(pubconv & scoped_n))
for key in ['outbound-campaigns', 'memor', 'automations', 'task-agents', 'company-oracle', 'architect-dispatch']:
    hits = sorted(p for p in unpub_n if key in p)
    print('==', key, len(hits))
    for h in hits: print('   ', h)
