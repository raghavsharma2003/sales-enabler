"""sha256 manifest for every raw artifact the Exotel lane saved under data/teardown/exotel (repo .git dirs excluded).
Usage (from repo root): python3 -I research/2026-10-20/teardown/exotel/code/build_manifest.py data/teardown/exotel <out_csv>"""
import csv, hashlib, json, os, subprocess, sys, datetime

ROOT, OUT = sys.argv[1], sys.argv[2]


def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def mtime(p):
    return datetime.datetime.fromtimestamp(os.path.getmtime(p), datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


# url and time maps from fetch logs: ts,code,url,file
logmap = {}
for log in ('fetchlog-dev-md.csv', 'fetchlog-docs-md.csv', 'site/fetchlog-html.csv'):
    lp = os.path.join(ROOT, log)
    if not os.path.exists(lp):
        continue
    base = os.path.dirname(lp)
    for r in csv.reader(open(lp)):
        if len(r) >= 4:
            logmap[os.path.normpath(os.path.join(base, r[3]))] = (r[2], r[0])

repo_url = {'agent-stream': 'https://github.com/exotel/agent-stream', 'ExotelMCP': 'https://github.com/exotel/ExotelMCP',
            'ClearStream': 'https://github.com/Saurabhsharma209/ClearStream'}
repo_head = {}
for r in repo_url:
    try:
        repo_head[r] = subprocess.run(['git', '-C', os.path.join(ROOT, 'repos', r), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    except Exception:
        repo_head[r] = ''

static = {
    'site/sitemap-in.xml': 'https://exotel.com/sitemap.xml?market=in',
    'site/sitemap-in-urls.txt': 'derived from https://exotel.com/sitemap.xml?market=in',
    'status/api_v2_summary.json': 'https://status.exotel.com/api/v2/summary.json',
    'status/api_v2_incidents.json': 'https://status.exotel.com/api/v2/incidents.json',
    'status/api_v2_components.json': 'https://status.exotel.com/api/v2/components.json',
    'status/history.rss': 'https://status.exotel.com/history.rss',
    'dns/getent.txt': 'derived: getent ahosts / gethostbyname_ex from the sandbox resolver, 2026-10-20',
    'dns/aws-ip-ranges.json': 'https://ip-ranges.amazonaws.com/ip-ranges.json',
    'capture/maps/exotelsdk.js.map': 'https://voicebot.in.exotel.com/js/dist/exotelsdk.js.map',
    'probe/dev-calling-hours.html': 'https://developer.exotel.com/docs/faqs/calling-hours',
    'complaints/capterra-in.html': 'https://www.capterra.in/software/134642/exotel',
    'complaints/g2.html': 'https://www.g2.com/products/exotel/reviews (HTTP 403)',
    'complaints/trustpilot-p1.html': 'https://www.trustpilot.com/review/exotel.com?page=1 (HTTP 403)',
    'complaints/trustpilot-p2.html': 'https://www.trustpilot.com/review/exotel.com?page=2 (HTTP 403)',
    'complaints/lk-search.json': 'https://community.livekit.io/search.json?q=exotel',
    'community/latest.json': 'https://community.exotel.com/latest.json',
    'dev-urls.txt': 'derived from https://developer.exotel.com/llms.txt',
    'docs-urls.txt': 'derived from https://docs.exotel.com/llms.txt',
    'docs-priority.txt': 'derived from https://docs.exotel.com/llms.txt',
    'dev-failed.txt': 'derived: first-pass failures', 'dev-failed-recheck.txt': 'derived: recheck of .md and HTML status',
    'refetch.txt': 'derived', 'site/pages.txt': 'derived: page list selected from sitemap-in-urls.txt',
    'dev-md/billing__pricing-model.md': 'https://developer.exotel.com/docs/billing/pricing-model.md (HTTP 404 page)', 'fetchlog-dev-md.csv': 'derived: fetch log', 'fetchlog-docs-md.csv': 'derived: fetch log',
    'site/fetchlog-html.csv': 'derived: fetch log', 'fetch-dev.out': 'derived: fetch log', 'fetch-docs.out': 'derived: fetch log',
}
capture_pages = {'home': 'https://exotel.com/', 'voicebot-in-login': 'https://voicebot.in.exotel.com/', 'my-in-login': 'https://my.in.exotel.com/',
                 'agentstream-product': 'https://exotel.com/products/agentstream-voice-streaming/', 'genai-voice-agents': 'https://exotel.com/products/gen-ai-voice-agents/'}
blog_url = {'achieve-low-latency-voice-ai-exotel': 'https://exotel.com/blog/achieve-low-latency-voice-ai-exotel/',
            'production-architecture-low-latency-voice-ai-exotel-livekit': 'https://exotel.com/blog/production-architecture-low-latency-voice-ai-exotel-livekit/',
            'migrate-twilio-to-exotel-voice-ai-india': 'https://exotel.com/blog/migrate-twilio-to-exotel-voice-ai-india/',
            'exotel-pricing-why-you-pay-what-you-pay': 'https://exotel.com/blog/exotel-pricing-why-you-pay-what-you-pay/',
            '1600-phone-number': 'https://exotel.com/blog/1600-phone-number/'}
jobs_url = {'exotel-software-development-engineer-ii-voicebot-1672857': 'https://www.hirist.tech/j/exotel-software-development-engineer-ii-voicebot-1672857'}

# voicebot JS: map file name -> URL from the HAR
js_url = {}
try:
    har = json.load(open(os.path.join(ROOT, 'capture/voicebot-in-login.har')))
    for e in har['log']['entries']:
        u = e['request']['url']
        n = u.split('?')[0].rstrip('/').split('/')[-1]
        js_url.setdefault(n, u)
except Exception:
    pass


def source(rel, full):
    if full in logmap:
        return logmap[full]
    if rel in static:
        return static[rel], mtime(full)
    parts = rel.split('/')
    top = parts[0]
    if top == 'repos' and len(parts) > 1:
        r = parts[1]
        return f"{repo_url.get(r, '')} @ {repo_head.get(r, '')} : {'/'.join(parts[2:])} (git clone --depth 1, read-only)", mtime(full)
    if top == 'probe':
        n = parts[-1].replace('.txt', '') if parts[-1].endswith('.html.txt') else parts[-1]
        u = 'https://' + n.replace('_', '/', 1).replace('_', '.') if False else n
        guess = {'exotel.com_robots.txt': 'https://exotel.com/robots.txt', 'exotel.com_llms.txt': 'https://exotel.com/llms.txt (redirected to homepage)',
                 'developer.exotel.com_llms.txt': 'https://developer.exotel.com/llms.txt', 'developer.exotel.com_robots.txt': 'https://developer.exotel.com/robots.txt',
                 'exotel.com_sitemap.xml': 'https://exotel.com/sitemap.xml', 'exotel.com_sitemap_index.xml': 'https://exotel.com/sitemap_index.xml (404)',
                 'developer.exotel.com_sitemap.xml': 'https://developer.exotel.com/sitemap.xml', 'docs.exotel.com_llms.txt': 'https://docs.exotel.com/llms.txt',
                 'support.exotel.com_robots.txt': 'https://support.exotel.com/robots.txt', 'status.exotel.com_': 'https://status.exotel.com/',
                 'exotel.com_pricing_': 'https://exotel.com/pricing/'}
        base = parts[-1][:-4] if parts[-1].endswith('.txt') and parts[-1][:-4] in guess else parts[-1]
        if base in guess:
            return (guess[base] + (' (text extract)' if base != parts[-1] else '')), mtime(full)
        if parts[-1].startswith('dev-calling-hours'):
            return 'https://developer.exotel.com/docs/faqs/calling-hours (text extract)', mtime(full)
    if top == 'site' and parts[1] == 'html':
        n = parts[-1]
        if n.endswith('.txt'):
            return 'derived text of https://exotel.com/' + n[:-4].replace('__', '/'), mtime(full)
        return 'https://exotel.com/' + n.replace('__', '/'), mtime(full)
    if top == 'status' and parts[-1].startswith('history-p'):
        p = parts[-1].split('-p')[1].split('.')[0]
        return f'https://status.exotel.com/history?page={p}' + (' (text extract)' if parts[-1].endswith('.txt') else ''), mtime(full)
    if top == 'capture':
        n = parts[-1]
        if len(parts) == 2:
            stem = n.split('.')[0]
            return f"Playwright capture of {capture_pages.get(stem, stem)} ({n.split('.', 1)[1]})", mtime(full)
        if parts[1] == 'voicebot-js':
            return js_url.get(n, 'https://voicebot.in.exotel.com/assets/' + n) + ' (extracted from HAR)', mtime(full)
        if parts[1] == 'slim':
            return 'derived: slimmed copy of capture/' + n + ' (bodies, cookies, query values removed)', mtime(full)
        if parts[1] == 'rea':
            return 'REA output (rea-agents 6.7.0) on local captures / local CDP target', mtime(full)
    if top == 'npm':
        pkg = parts[-1].replace('.time.json', '')
        pkg = '@' + pkg[1:].replace('_', '/', 1) if pkg.startswith('_') else pkg
        return f'https://registry.npmjs.org/{pkg} (npm view time --json)', mtime(full)
    if top == 'blog':
        stem = parts[-1].replace('.html.txt', '').replace('.html', '')
        return blog_url.get(stem, 'https://exotel.com/blog/' + stem + '/') + (' (text extract)' if parts[-1].endswith('.txt') else ''), mtime(full)
    if top == 'jobs':
        stem = parts[-1].replace('.html.txt', '').replace('.html', '')
        return jobs_url.get(stem, 'https://jobs.weekday.works/' + stem) + (' (text extract)' if parts[-1].endswith('.txt') else ''), mtime(full)
    if top == 'community':
        t = parts[-1].replace('.json', '')
        return f'https://community.exotel.com/t/{t[1:]}.json', mtime(full)
    if top == 'complaints':
        n = parts[-1]
        if n.startswith('lk-t'):
            return f"https://community.livekit.io/t/{n[4:].replace('.json', '')}.json", mtime(full)
        if n.endswith('.txt'):
            return 'derived text of ' + static.get('complaints/' + n[:-4], n), mtime(full)
    return 'unknown', mtime(full)


rows = []
for dp, dns, fns in os.walk(ROOT):
    dns[:] = [d for d in dns if d != '.git']
    for fn in fns:
        full = os.path.normpath(os.path.join(dp, fn))
        rel = os.path.relpath(full, ROOT)
        url, ts = source(rel, full)
        rows.append([os.path.join('data/teardown/exotel', rel), os.path.getsize(full), sha(full), url, ts])
rows.sort()
with open(OUT, 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['path', 'bytes', 'sha256', 'source_url', 'fetched_at'])
    w.writerows(rows)
print(len(rows), sum(r[1] for r in rows), sum(1 for r in rows if r[3] == 'unknown'))
