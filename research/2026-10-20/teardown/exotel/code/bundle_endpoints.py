"""Extract API path constants and voicebot routes from the public voicebot login-page JS bundle (captured by Playwright, no login).
Usage: python3 -I bundle_endpoints.py <js_dir> <out_json>"""
import sys, re, json, os
d, out = sys.argv[1], sys.argv[2]
consts, paths, routes = {}, {}, {}
for f in sorted(os.listdir(d)):
    if not f.endswith('.js'): continue
    t = open(os.path.join(d, f), encoding='utf-8', errors='replace').read()
    for m in re.finditer(r'([A-Z][A-Z0-9_]{3,60}):"(/(?:v\d|api|accounts|tools)[^"]{2,160})"', t):
        consts.setdefault(m.group(1), m.group(2))
    for m in re.finditer(r'[`"](/(?:v\d|api/v\d|accounts)/[^"`\s]{3,160})[`"]', t):
        p = re.sub(r'\$\{[^}]*\}', '{x}', m.group(1))
        paths[p] = paths.get(p, 0) + 1
    for m in re.finditer(r'"(/voicebot/[a-zA-Z0-9_/:\-]+)"', t):
        routes[m.group(1)] = routes.get(m.group(1), 0) + 1
vb = sorted(p for p in paths if re.search(r'voicebot|assistant|llm|tts|asr|vad|specialization|prompt|persona|voice-provider|report|usage|call-log|rating|feedback|superset|tenants', p))
json.dump({'source_dir': d, 'n_files': len([f for f in os.listdir(d) if f.endswith('.js')]),
           'named_constants': consts, 'voicebot_related_paths': vb, 'console_routes': sorted(routes),
           'n_distinct_paths': len(paths)}, open(out, 'w'), indent=1)
print(len(consts), len(vb), len(routes), len(paths))
