"""Writes manifest.csv (path,bytes,sha256,source_url,fetched_at) for every raw file under data/teardown/vapi.
Run from repo root: python3 -I research/2026-10-20/teardown/vapi/code/build_manifest.py > research/2026-10-20/teardown/vapi/manifest.csv"""
import os, sys, hashlib, csv, datetime, re
ROOT = 'data/teardown/vapi'
def url_for(rel):
    p = rel[len(ROOT) + 1:]
    d, f = (p.split('/', 1) + [''])[:2]
    if d == 'docs':
        m = {'docs.vapi.ai_llms.txt': 'https://docs.vapi.ai/llms.txt', 'docs.vapi.ai_llms-full.txt': 'https://docs.vapi.ai/llms-full.txt',
             'vapi.ai_pricing': 'https://vapi.ai/pricing', 'vapi.ai_index': 'https://vapi.ai/', 'vapi.ai_sitemap.xml': 'https://vapi.ai/sitemap.xml',
             'docs.vapi.ai_sitemap.xml': 'https://docs.vapi.ai/sitemap.xml', 'vapi.ai_robots.txt': 'https://vapi.ai/robots.txt', 'docs.vapi.ai_changelog': 'https://docs.vapi.ai/changelog'}
        return m.get(f, '')
    if d == 'docs-md': return 'https://docs.vapi.ai/' + f[:-3].replace('__', '/') + '.md'
    if d == 'openapi':
        return {'docs.vapi.ai_openapi.json': 'https://docs.vapi.ai/openapi.json', 'api.vapi.ai_api-json': 'https://api.vapi.ai/api-json',
                'docs.vapi.ai_openapi_webhooks.json': 'https://docs.vapi.ai/openapi/webhooks.json', 'docs.vapi.ai_openapi_api-reference.json': 'https://docs.vapi.ai/openapi/api-reference.json'}.get(f, '')
    if d == 'changelog':
        if f.startswith('entries/'):
            y, mo, da = f[8:-3].split('-'); return 'https://docs.vapi.ai/whats-new/%s/%s/%s.md' % (y, mo, da)
        return {'whats-new_llms.txt': 'https://docs.vapi.ai/whats-new/llms.txt', 'changelog_llms.txt': 'https://docs.vapi.ai/changelog/llms.txt', 'urls-2026.txt': 'derived from https://docs.vapi.ai/whats-new/llms.txt'}.get(f, '')
    if d in ('dashboard-js', 'dashboard-js-lazy'):
        if f == '_index.json': return 'derived index of har/dashboard-login HAR scripts'
        return 'https://dashboard.vapi.ai/' + f.replace('__', '/', 1)
    if d == 'har':
        if 'dashboard' in f: return 'https://dashboard.vapi.ai/ (passive Playwright capture)'
        return 'https://vapi.ai/ (passive Playwright capture)'
    if d == 'har-sanitized': return 'derived (slimmed, redacted copy of har/) for REA'
    if d == 'demo-call': return 'https://vapi.ai/ homepage demo "Start call" (one 25 s call, synthetic tone caller)'
    if d == 'rea': return 'REA output (rea-agents@latest 6.7.0) on local captures'
    if d == 'net':
        if f == 'aws-ip-ranges.json': return 'https://ip-ranges.amazonaws.com/ip-ranges.json'
        m = re.match(r'rdap-(.+)\.json', f)
        if m: return ('https://rdap.db.ripe.net/ip/' if m.group(1).startswith('167.235') else 'https://rdap.arin.net/registry/ip/') + m.group(1)
    if d == 'jobs':
        return {'ashby-vapi.json': 'https://api.ashbyhq.com/posting-api/job-board/vapi?includeCompensation=true', 'vapi.ai_careers.html': 'https://vapi.ai/careers'}.get(f, '')
    if d == 'status':
        return {'status_index.html': 'https://status.vapi.ai/', 's_feed.rss': 'https://status.vapi.ai/feed.rss', 's_incidents.rss': 'https://status.vapi.ai/incidents.rss', 's_index.json': 'https://status.vapi.ai/index.json', 'incidents-parsed.json': 'derived from s_feed.rss'}.get(f, '')
    if d == 'blog':
        s = f.rsplit('.', 1)[0]
        return 'https://vapi.ai/blog/' + s if not f.endswith('blog-urls.txt') else 'derived from https://vapi.ai/sitemap.xml'
    if d == 'complaints':
        return {'trustpilot-webfetch-2026-10-20.txt': 'https://www.trustpilot.com/review/vapi.ai (via WebFetch)', 'hn-vapi-comments.json': 'https://hn.algolia.com/api/v1/search_by_date?query=%22vapi%22&tags=comment&typoTolerance=false'}.get(f, '')
    if d == 'india':
        return {'www.twilio.com_en-us_guidelines_in_voice': 'https://www.twilio.com/en-us/guidelines/in/voice', 'plivo.com_docs_voice-agents_sip-trunking_integration-guides_vapi': 'https://plivo.com/docs/voice-agents/sip-trunking/integration-guides/vapi',
                'docs.vapi.ai_tcpa-consent.md': 'https://docs.vapi.ai/tcpa-consent.md'}.get(f, 'https://dev.to/animesh_gupta_705a19fc6f8/how-to-give-your-livekit-vapi-or-retell-voice-agent-a-real-indian-91-phone-number-am6' if f.startswith('dev.to') else '')
    if d == 'pricing':
        return {'vapi.ai_pricing.html': 'https://vapi.ai/pricing', 'twilio_voice_pricing_in.html': 'https://www.twilio.com/en-us/voice/pricing/in', 'daily.co_pricing.html': 'https://www.daily.co/pricing/'}.get(f, '')
    if d == 'sdk-npm-web': return 'https://registry.npmjs.org/@vapi-ai/web/-/web-3.0.0.tgz' + ('' if f.endswith('.tgz') else ' (unpacked)')
    if d == 'sdk-npm-server-sdk': return 'https://registry.npmjs.org/@vapi-ai/server-sdk/-/server-sdk-3.0.0.tgz' + ('' if f.endswith('.tgz') else ' (unpacked)')
    if d == 'sdk-pypi-server': return 'https://pypi.org/pypi/vapi_server_sdk/json' if f == 'pypi.json' else 'https://pypi.org/project/vapi_server_sdk/3.0.0/'
    return ''
rows = []
for dp, dn, fn in os.walk(ROOT):
    dn.sort()
    for f in sorted(fn):
        p = os.path.join(dp, f)
        b = open(p, 'rb').read()
        rows.append((p, len(b), hashlib.sha256(b).hexdigest(), url_for(p), datetime.datetime.utcfromtimestamp(os.path.getmtime(p)).strftime('%Y-%m-%dT%H:%M:%SZ')))
w = csv.writer(sys.stdout); w.writerow(['path', 'bytes', 'sha256', 'source_url', 'fetched_at']); w.writerows(rows)
print('files', len(rows), 'missing_url', sum(1 for r in rows if not r[3]), file=sys.stderr)
