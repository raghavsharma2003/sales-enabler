"""Builds manifest.csv: path,bytes,sha256,source_url,fetched_at for every raw artifact under data/teardown/squadstack.
Run from repo root: python3 -I research/2026-10-20/teardown/squadstack/code/build_manifest.py"""
import csv, hashlib, os, json, datetime, re
ROOT = 'data/teardown/squadstack'
# url maps from fetch logs
urlmap = {}
for sub in ('pages', 'blog', 'osno'):
    fl = os.path.join(ROOT, sub, 'fetchlog.csv')
    if os.path.exists(fl):
        for row in csv.reader(open(fl)):
            if len(row) >= 3:
                ts, url, stem = row[0], row[1], row[2]
                urlmap[os.path.join(ROOT, sub, 'raw', stem + '.html')] = (url, ts)
                urlmap[os.path.join(ROOT, sub, 'txt', stem + '.txt')] = (url + ' (text extracted locally)', ts)
# portal chunk urls
rr = os.path.join(ROOT, 'portal-js', 'all-chunks.txt')
if os.path.exists(rr):
    for p in open(rr).read().split():
        f = os.path.join(ROOT, 'portal-js', 'all', p.replace('static/chunks/', '').replace('/', '__'))
        urlmap[f] = ('https://portal.app.squadstack.com/_next/' + p, None)
fixed = {
 'site/www.squadstack.ai_robots.txt': 'https://www.squadstack.ai/robots.txt',
 'site/www.squadstack.ai_sitemap.xml': 'https://www.squadstack.ai/sitemap.xml',
 'site/www.squadstack.ai_llms.txt': 'https://www.squadstack.ai/llms.txt',
 'site/www.squadstack.ai_llms-full.txt': 'https://www.squadstack.ai/llms-full.txt (404 page)',
 'site/www.squadstack.ai_index': 'https://www.squadstack.ai/',
 'site/www.squadstack.ai_pricing': 'https://www.squadstack.ai/pricing',
 'site/www.squadstack.com_index': 'https://www.squadstack.com/ (redirects to .ai)',
 'portal-js/70baepaALMk2wtGl0PNPB__buildManifest.js': 'https://portal.app.squadstack.com/_next/static/70baepaALMk2wtGl0PNPB/_buildManifest.js',
 'portal-js/70baepaALMk2wtGl0PNPB__ssgManifest.js': 'https://portal.app.squadstack.com/_next/static/70baepaALMk2wtGl0PNPB/_ssgManifest.js',
 'portal-js/chunks_pages__app-8197a4d79c7c94cf.js': 'https://portal.app.squadstack.com/_next/static/chunks/pages/_app-8197a4d79c7c94cf.js',
 'portal-js/chunks_pages_auth_login-2c1b3960928c201c.js': 'https://portal.app.squadstack.com/_next/static/chunks/pages/auth/login-2c1b3960928c201c.js',
 'portal-js/chunks_3187-1c348c67358d7eb0.js': 'https://portal.app.squadstack.com/_next/static/chunks/3187-1c348c67358d7eb0.js',
 'portal-js/chunks_6241.980c77034e404397.js': 'https://portal.app.squadstack.com/_next/static/chunks/6241.980c77034e404397.js',
 'portal-js/chunks_main-06f62dd5a0b65c95.js': 'https://portal.app.squadstack.com/_next/static/chunks/main-06f62dd5a0b65c95.js',
 'portal-js/chunks_webpack-8cdaaa6cfd26411d.js': 'https://portal.app.squadstack.com/_next/static/chunks/webpack-8cdaaa6cfd26411d.js',
 'portal-js/all/pages___app.js': 'https://portal.app.squadstack.com/_next/static/chunks/pages/_app-8197a4d79c7c94cf.js (copy)',
 'portal-js/routes-resolved.json': 'derived locally from _buildManifest.js',
 'portal-js/all-chunks.txt': 'derived locally from _buildManifest.js',
 'portal-js/ui-strings.json': 'derived locally from portal-js/all/*.js',
 'har/portal-login.requests.json': 'https://portal.app.squadstack.com/auth/login (Playwright request log)',
 'har/portal-login.dom.html': 'https://portal.app.squadstack.com/auth/login (rendered DOM)',
 'har/portal-login.png': 'https://portal.app.squadstack.com/auth/login (screenshot)',
 'har/ai-platform.har': 'https://ai-platform.squadstack.ai/ai-agents -> /auth (Playwright HAR)',
 'har/ai-platform.requests.json': 'https://ai-platform.squadstack.ai/ai-agents (request log)',
 'har/ai-platform.dom.html': 'https://ai-platform.squadstack.ai/auth (rendered DOM)',
 'har/ai-platform.png': 'https://ai-platform.squadstack.ai/auth (screenshot)',
 'har/www-home.har': 'https://www.squadstack.ai/ (Playwright HAR)',
 'har/www-home.requests.json': 'https://www.squadstack.ai/ (request log)',
 'har/www-home.dom.html': 'https://www.squadstack.ai/ (rendered DOM)',
 'har/www-home.png': 'https://www.squadstack.ai/ (screenshot)',
 'inapp-sdk/main.js': 'https://d1iba7cd9se7zf.cloudfront.net/main.js',
 'apidocs/index.html': 'https://apidocs.squadstack.com/',
 'apidocs/collection.json': 'https://apidocs.squadstack.com/api/collections/32244764/2s9YsRcp3h?segregateAuth=true&versionTag=latest',
 'apidocs/metadata.json': 'https://apidocs.squadstack.com/view/metadata/2s9YsRcp3h',
 'trust/index.html': 'https://trust.squadstack.com/ (-> trust.squadstack.ai)',
 'trust/index.txt': 'https://trust.squadstack.ai/ (text extracted locally)',
 'trust/trust-rendered.txt': 'https://trust.squadstack.ai/ (rendered text)',
 'trust/trust-rendered.api.json': 'https://trust.squadstack.ai/graphql (responses captured while rendering)',
 'trust/trust-rendered.png': 'https://trust.squadstack.ai/ (screenshot)',
 'jobs/careers.html': 'https://careers.squadstack.com/',
 'jobs/careers.txt': 'https://careers.squadstack.com/ (text extracted locally)',
 'jobs/webflow-php.json': 'https://careers.squadstack.com/webflow.php',
 'hf/datasets-search.json': 'https://huggingface.co/api/datasets?search=squadstack&full=true',
 'hf/models-author.json': 'https://huggingface.co/api/models?author=squadstack',
 'hf/spaces-search.json': 'https://huggingface.co/api/spaces?search=squadstack',
 'hf/dataset-README.md': 'https://huggingface.co/datasets/Squadstack/conversational-streaming-asr-benchmark/raw/main/README.md (401)',
 'hf/dataset-api.json': 'https://huggingface.co/api/datasets/Squadstack/conversational-streaming-asr-benchmark',
 'github-lens-mcp/README-main.md': 'https://raw.githubusercontent.com/SquadRun/lens-mcp/main/README.md',
 'sdk/npm-search.json': 'https://registry.npmjs.org/-/v1/search?text=squadstack&size=20',
 'sdk/npm-osno.json': 'https://registry.npmjs.org/-/v1/search?text=osno&size=10',
 'sdk/pypi-squadstack.json': 'https://pypi.org/pypi/squadstack/json (404)',
 'sdk/gh-org-squadstack.json': 'https://api.github.com/orgs/squadstack/repos (blocked by sandbox proxy)',
 'sdk/gh-org-squadrun.json': 'https://api.github.com/orgs/SquadRun/repos (blocked by sandbox proxy)',
 'dns/aws-ip-ranges.json': 'https://ip-ranges.amazonaws.com/ip-ranges.json',
 'dns/aws-ip-region-matches.json': 'derived locally from aws-ip-ranges.json',
 'dns/http-headers-deploy-dates.txt': 'HEAD requests to portal/ai-platform/app.osno.ai/in-app SDK URLs',
 'dns/crtsh-squadstack.com.json': 'https://crt.sh/?q=%25.squadstack.com&output=json (502)',
 'dns/crtsh-squadstack.ai.json': 'https://crt.sh/?q=%25.squadstack.ai&output=json (502)',
 'dns/crtsh2-squadstack.com.json': 'https://crt.sh/?q=squadstack.com&output=json (502)',
 'complaints/capterra.txt': 'https://www.capterra.com/p/10034204/SquadStack-ai/ (text extracted locally)',
 'complaints/play.txt': 'https://play.google.com/store/apps/details?id=com.squad.run&hl=en_IN (text extracted locally)',
 'complaints/play.google.com_store_apps_details_id_com.squad.run_hl_en_IN.html': 'https://play.google.com/store/apps/details?id=com.squad.run&hl=en_IN',
 'complaints/www.capterra.com_p_10034204_SquadStack-ai_.html': 'https://www.capterra.com/p/10034204/SquadStack-ai/',
 'complaints/www.g2.com_products_squadstack_reviews.html': 'https://www.g2.com/products/squadstack/reviews (403, bot protection; not bypassed)',
 'complaints/sourceforge.net_software_product_SquadStack_.html': 'https://sourceforge.net/software/product/SquadStack/ (403)',
 'complaints/www.trustpilot.com_review_squadstack.com.html': 'https://www.trustpilot.com/review/squadstack.com (403)',
 'complaints/www.trustpilot.com_review_squadstack.ai.html': 'https://www.trustpilot.com/review/squadstack.ai (403)',
 'complaints/www.ambitionbox.com_reviews_squadstack-reviews.html': 'https://www.ambitionbox.com/reviews/squadstack-reviews (HTTP/2 error, empty)',
 'rea/rea-status.json': 'local REA run log',
 'pages/fetchlog.csv': 'local fetch log', 'blog/fetchlog.csv': 'local fetch log', 'osno/fetchlog.csv': 'local fetch log',
 'rea/rea-doctor.json': 'npx rea-agents doctor',
 'rea/rea-inspect-ai-platform-har.json': 'npx rea-agents inspect har/ai-platform.har',
 'rea/rea-inspect-ai-platform-har.err': 'npx rea-agents inspect har/ai-platform.har (stderr)',
 'rea/rea-ai-platform-web-bundle.json': 'npx rea-agents analyze-web-bundle (no output, timeout)',
 'rea/rea-ai-platform-web-bundle.err': 'npx rea-agents analyze-web-bundle (stderr, empty)',
}
for k, v in fixed.items(): urlmap[os.path.join(ROOT, k)] = (v, None)
rows = []
for dp, dn, fn in os.walk(ROOT):
    for f in sorted(fn):
        p = os.path.join(dp, f)
        b = open(p, 'rb').read()
        url, ts = urlmap.get(p, (None, None))
        if url is None:
            rel = os.path.relpath(p, ROOT)
            if rel.startswith('dns/doh_'):
                name = rel[8:-5]; host, typ = name.rsplit('_', 1)
                url = f'https://cloudflare-dns.com/dns-query?name={host}&type={typ}'
            elif rel.startswith('ai-platform-js/'):
                url = 'https://ai-platform.squadstack.ai/_next/' + rel.split('/', 1)[1].replace('static_chunks_', 'static/chunks/').replace('static_css_', 'static/css/').replace('static_media_', 'static/media/').replace('chunks/app_', 'chunks/app/') + ' (body extracted from har/ai-platform.har)'
            elif rel.startswith('complaints/') and rel.endswith('.html'):
                url = 'https://' + rel.split('/', 1)[1][:-5].replace('_', '/', 1) + ' (raw fetch; path separators flattened)'
            elif rel.startswith('osno/raw/app.osno.ai'):
                url = 'https://app.osno.ai/'
            elif rel.startswith('osno/raw/osno.ai'):
                url = 'https://osno.ai/'
            else:
                url = 'unknown'
        if ts is None:
            ts = datetime.datetime.fromtimestamp(os.path.getmtime(p), datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        rows.append([p, len(b), hashlib.sha256(b).hexdigest(), url, ts])
out = 'research/2026-10-20/teardown/squadstack/manifest.csv'
with open(out, 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow(['path', 'bytes', 'sha256', 'source_url', 'fetched_at']); w.writerows(rows)
print(len(rows), 'rows;', sum(r[1] for r in rows), 'bytes;', sum(1 for r in rows if r[3] == 'unknown'), 'unknown urls')
for r in rows:
    if r[3] == 'unknown': print('  ', r[0])
