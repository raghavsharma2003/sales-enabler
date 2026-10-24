"""manifest.csv (path,bytes,sha256,source_url,fetched_at) for every raw artifact under data/teardown/elevenlabs.
Source URLs come from _fetchlog.jsonl (written by fetch.sh) or, for files made by other steps, from the rules below.
Run from repo root: python3 -I research/2026-10-20/teardown/elevenlabs/code/build_manifest.py"""
import os, csv, json, hashlib, datetime
ROOT = 'data/teardown/elevenlabs'
OUT = 'research/2026-10-20/teardown/elevenlabs/manifest.csv'
log = {}
for line in open(os.path.join(ROOT, '_fetchlog.jsonl')):
    try:
        r = json.loads(line); log[r['path']] = r
    except Exception:
        pass
NPM = {'sdk-npm-client': '@elevenlabs/client/-/client-1.29.0.tgz', 'sdk-npm-react': '@elevenlabs/react/-/react-1.19.0.tgz',
       'sdk-npm-convai-widget-core': '@elevenlabs/convai-widget-core/-/convai-widget-core-0.21.0.tgz',
       'sdk-npm-convai-widget-embed': '@elevenlabs/convai-widget-embed/-/convai-widget-embed-0.21.0.tgz',
       'sdk-npm-elevenlabs-js': '@elevenlabs/elevenlabs-js/-/elevenlabs-js-2.74.0.tgz',
       'sdk-npm-react-native': '@elevenlabs/react-native/-/react-native-1.2.31.tgz'}
def rule(rel):
    top = rel[len(ROOT) + 1:].split('/')[0]
    name = os.path.basename(rel)
    if top in NPM:
        u = 'https://registry.npmjs.org/' + NPM[top]
        return u if rel.endswith('.tgz') else u + ' (unpacked locally, not executed)'
    if top == 'sdk-pypi-elevenlabs':
        return 'https://pypi.org/project/elevenlabs/2.74.1/ (pip download --no-deps' + (')' if rel.endswith('.whl') else '; unzipped locally, not executed)')
    if top == 'har':
        return {'www-agents.har': 'https://elevenlabs.io/agents (passive Playwright capture)', 'app-sign-in.har': 'https://elevenlabs.io/app/sign-in (passive Playwright capture, no login)'}.get(name, '')
    if top == 'web':
        return 'https://elevenlabs.io/agents (passive capture summary)' if 'agents' in name else 'https://elevenlabs.io/app/sign-in (passive capture summary)'
    if top == 'har-sanitized':
        return 'derived: har_slim.py (bodies, cookies and auth headers removed; URLs percent-encoded) for REA'
    if top == 'app-js':
        return 'derived: first-party JS bodies exported from har/app-sign-in.har (data only, never executed); per-file URLs in app-js/_index.json'
    if top == 'www-js':
        return 'derived: first-party JS bodies exported from har/www-agents.har; per-file URLs in www-js/_index.json'
    if top.startswith('demo-call'):
        if top == 'demo-call-in':
            return 'research/2026-10-17/lanes/l4b-measured/battery/audio/P1_t01.wav (our synthetic caller clip, copied)'
        return 'https://elevenlabs.io/conversational-ai public "Web call" demo (' + ('one 25 s call, synthetic caller' if top == 'demo-call' else 'attempt with no session started') + ')'
    if top == 'rea':
        return 'REA output (rea-agents@latest 6.7.0) on local files'
    if top == 'status' and name == 'incidents-parsed.json':
        return 'derived from status/feed.rss'
    if top == 'complaints' and name == 'hn-filtered.json':
        return 'derived from complaints/hn-*.json (filter for ElevenLabs agent complaints)'
    if name.endswith('.html.txt'):
        return 'derived: text extracted from ' + name[:-4]
    if name == 'elevenlabs.io_india.txt':
        return 'derived: text extracted from elevenlabs.io_india.html (https://elevenlabs.io/india)'
    if top == 'changelog' and name.startswith('urls'):
        return 'derived from changelog/changelog_llms.txt'
    if name == '_convai_endpoints.txt':
        return 'derived from openapi/api.elevenlabs.io_openapi.json'
    if name == '_pages.txt':
        return 'derived from docs/llms.txt'
    if name == '_fetchlog.jsonl':
        return 'fetch log written by code/fetch.sh'
    return ''
rows = []
for dp, dn, fn in os.walk(ROOT):
    dn.sort()
    for f in sorted(fn):
        p = os.path.join(dp, f)
        b = open(p, 'rb').read()
        r = log.get(p)
        src = r['url'] if r else rule(p)
        ts = r['fetched_at'] if r else datetime.datetime.fromtimestamp(os.path.getmtime(p), datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        rows.append((p, len(b), hashlib.sha256(b).hexdigest(), src, ts))
with open(OUT, 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow(['path', 'bytes', 'sha256', 'source_url', 'fetched_at']); w.writerows(rows)
print('files', len(rows), 'bytes', sum(r[1] for r in rows), 'missing_url', [r[0] for r in rows if not r[3]][:20])
