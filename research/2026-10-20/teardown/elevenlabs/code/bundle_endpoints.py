"""Extract the generated API client routes from signed-out dashboard JS (string matching only; nothing executed)
and diff them against the vendor's public OpenAPI, to surface unpublished features.
Usage (repo root): python3 -I research/2026-10-20/teardown/elevenlabs/code/bundle_endpoints.py <js-dir> <openapi.json> <out.json> [path-prefix]"""
import re, glob, json, sys, collections
jsdir, oapi, out = sys.argv[1], sys.argv[2], sys.argv[3]; prefix = sys.argv[4] if len(sys.argv) > 4 else '/v1/convai'
eps = {}
for f in glob.glob(jsdir + '/*'):
    if f.endswith('_index.json'): continue
    t = open(f, errors='ignore').read()
    for m in re.finditer(r'url:"(/v[0-9]/[^"]+)",method:"(get|post|put|patch|delete)"', t): eps[(m.group(2).upper(), m.group(1))] = f
    for m in re.finditer(r'path:"(/v[0-9]/[^"]+)",operationId:"([A-Za-z0-9_]+)"', t): eps.setdefault(('?', m.group(1)), f)
pub = json.load(open(oapi))['paths']
norm = lambda p: re.sub(r'\{[^}]+\}', '{}', p)
pubpaths = {norm(p) for p in pub}
allp = sorted(eps)
scoped = [x for x in allp if x[1].startswith(prefix) or x[1].startswith('/v1/speech-engine')]
unpub = [x for x in scoped if norm(x[1]) not in pubpaths]
json.dump({'all': allp, 'convai_unpublished': unpub, 'counts': {'bundle_endpoints': len(allp), 'scoped': len(scoped), 'scoped_unpublished': len(unpub)},
           'unpublished_by_group': collections.Counter(x[1].split('/')[3] for x in unpub).most_common()}, open(out, 'w'), indent=1)
print(len(allp), len(scoped), len(unpub))
