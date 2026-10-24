"""Exotel velocity over 2026-04-20..2026-10-20 from saved raw files (no network).
Usage: python3 -I velocity.py <data_dir> <out_json>"""
import sys, os, re, json, glob, html
D, OUT = sys.argv[1], sys.argv[2]
W0, W1 = '2026-04-20', '2026-10-20'
MON = {m: i for i, m in enumerate(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], 1)}
def inwin(d): return W0 <= d <= W1
out = {'window': [W0, W1]}
# 1. /build engineering posts (date line "Author·DD Mon YYYY")
posts = []
for f in glob.glob(os.path.join(D, 'site/html/build__*.txt')):
    if os.path.basename(f) == 'build__.txt': continue  # index page, not a post
    m = re.search(r'·(\d{1,2}) ([A-Z][a-z]{2})[a-z]* (20\d\d)', open(f).read())
    if m:
        d = f"{m.group(3)}-{MON[m.group(2)]:02d}-{int(m.group(1)):02d}"
        posts.append({'file': os.path.relpath(f, D), 'date': d})
out['build_posts'] = {'n_total': len(posts), 'n_in_window': sum(inwin(p['date']) for p in posts), 'items': sorted(posts, key=lambda p: p['date'])}
# 2. docs.exotel.com pages created in window, voice-AI sections
sec = ('intelligent-voice-agents', 'exotel-agentstream', 'mcp-server', 'harmony', 'conversation-intelligence', 'ai-assist')
docs = {}
for f in glob.glob(os.path.join(D, 'docs-md/*.md')):
    b = os.path.basename(f); s = b.split('__')[0].replace('.md', '')
    m = re.search(r'createdAt: (\d{4}-\d\d-\d\d)', open(f, errors='replace').read())
    if not m: continue
    k = s if s in sec else 'other'
    docs.setdefault(k, {'n': 0, 'n_in_window': 0})
    docs[k]['n'] += 1; docs[k]['n_in_window'] += inwin(m.group(1))
out['docs_pages_created'] = docs
# 3. developer changelog: latest dated entry
cl = open(os.path.join(D, 'dev-md/references__changelog.md')).read()
out['developer_changelog_latest_heading'] = re.findall(r'^### (.+)$', cl, re.M)[0]
# 4. npm release counts
npm = {}
for f in glob.glob(os.path.join(D, 'npm/*.time.json')):
    t = json.load(open(f)); v = {k: x for k, x in t.items() if k not in ('created', 'modified')}
    npm[os.path.basename(f).replace('.time.json', '')] = {'releases_total': len(v), 'releases_in_window': sum(inwin(x[:10]) for x in v.values()), 'last': t.get('modified', '')[:10]}
out['npm'] = npm
# 5. status page: incidents and maintenances per month from history pages
months = []
for p in sorted(glob.glob(os.path.join(D, 'status/history-p*.html'))):
    m = re.search(r'data-react-props="([^"]+)"', open(p).read())
    if not m: continue
    for mo in json.loads(html.unescape(m.group(1))).get('months', []):
        inc = mo.get('incidents', [])
        months.append({'month': f"{mo.get('year')}-{mo.get('name')}", 'unplanned': sum(1 for i in inc if i.get('impact') != 'maintenance'),
                       'maintenance': sum(1 for i in inc if i.get('impact') == 'maintenance')})
out['status_history'] = months
s = json.load(open(os.path.join(D, 'status/api_v2_summary.json')))
out['status_components_total'] = len(s['components'])
out['status_components_voice_ai'] = [c['name'] for c in s['components'] if re.search(r'\b(voice ?bot|bot|stream|agentstream|ai|mcp)\b', c['name'], re.I)]
out['status_non_operational'] = [{'name': c['name'], 'status': c['status'], 'since': c['updated_at']} for c in s['components'] if c['status'] != 'operational']
json.dump(out, open(OUT, 'w'), indent=1)
print(json.dumps({k: (v if k not in ('build_posts',) else {'n_total': v['n_total'], 'n_in_window': v['n_in_window']}) for k, v in out.items()}, indent=1))
