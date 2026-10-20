"""Build watchlist.json from the probe CSVs. Usage: python3 -I build_watchlist.py <repo_root> <out_json>"""
import csv, json, os, sys
root, out = sys.argv[1], sys.argv[2]
B = os.path.join(root, 'data/teardown/radar/_watchlist-baseline')
S = os.path.join(root, 'data/teardown/radar/_sweep')

METHOD = {
    'pricing': 'html-to-text, strip nav/footer, diff normalised text; alert on any change to a number followed by /min, ₹, $, %, or a plan name',
    'pricing-api': 'same as pricing',
    'pricing-agents': 'same as pricing',
    'pricing-samvaad-docs': 'same as pricing (docs page)',
    'changelog': 'html-to-text; alert on new dated headings since the last run; keep the entry titles',
    'docs-index': 'llms.txt line-set diff; alert on added/removed doc URLs (new features show up here first)',
    'docs-sitemap': 'sitemap <loc> set diff; alert on new paths',
    'sitemap': 'sitemap <loc> set diff (follow sitemap index); alert on new paths under /pricing, /product, /changelog, /blog',
    'sitemap-in': 'sitemap <loc> set diff',
    'status': 'parse incidents; alert on new incidents, and count per month by component (telephony / model / platform)',
    'status-feed': 'RSS/Atom: new <item> guids since last run; classify title into telephony / model-provider / latency / scheduling / other',
    'status-json': 'JSON incidents list: new ids since last run, with impact and components',
    'releases': 'Atom feed of tags (blocked from this sandbox: 403); use releases-pypi instead',
    'releases-pypi': 'PyPI JSON: new versions since last run (velocity = releases per 30 days)',
    'sdk': 'npm registry JSON: new dist-tags/versions since last run',
    'sdk-pypi': 'PyPI JSON: new versions since last run',
    'blog': 'html-to-text; alert on new post titles',
    'newsroom': 'html-to-text; alert on new press items',
    'docs': 'html-to-text; alert on nav changes',
    'voice-ai': 'html-to-text diff',
    'ai-agents': 'html-to-text diff (currently redirects to homepage: watch for a real page)',
}
NOTE = {
    ('bolna', 'releases'): 'github.com Atom returned 403 from this sandbox; PyPI release feed used instead.',
    ('sarvam', 'sitemap'): 'returned 404 today; keep to detect when a sitemap appears, or drop.',
    ('squadstack', 'docs'): 'docs.squadstack.ai CONNECT 502 from the sandbox today; retry weekly.',
    ('radar-plivo', 'ai-agents'): 'https://www.plivo.com/ai-voice-agents/ redirects to the homepage; Plivo agent pages seen in search are 404.',
    ('exotel', 'sitemap'): 'sitemap index by market; follow ?market=in.',
}
DEEP = {'bolna', 'sarvam', 'vapi', 'retell', 'elevenlabs', 'synthflow', 'squadstack', 'exotel'}
items = []
for fn in ('probe-2026-10-20.csv', 'probe2-2026-10-20.csv'):
    for r in csv.DictReader(open(os.path.join(B, fn))):
        v = r['vendor']
        items.append(dict(
            vendor=v.replace('radar-', ''), set='deep' if v in DEEP else 'radar', kind=r['kind'], url=r['url'],
            final_url=r['final_url'], diff_method=METHOD.get(r['kind'], 'html-to-text diff'),
            baseline=dict(status=r['status'], bytes=int(r['bytes'] or 0), sha256=r['sha256'],
                          path=os.path.relpath(r['path'], root) if r['path'] else '', fetched_at=r['fetched_at']),
            note=NOTE.get((v, r['kind']), '')))
sweep = []
for r in csv.DictReader(open(os.path.join(S, 'probe-sweep-2026-10-20.csv'))):
    sweep.append(dict(source=r['kind'], url=r['url'], status_2026_10_20=r['status'],
                      usable=r['status'] == '200',
                      method={'hn-show': 'HN Algolia JSON: hits created since last run; keep title, url, points',
                              'hn-story': 'HN Algolia JSON: hits created since last run',
                              'inc42-feed': 'RSS: items whose title matches /voice|calling|telecall|conversational/i',
                              'yourstory-feed': 'RSS: items matching /voice|calling|conversational/i',
                              'techcrunch-voice': 'RSS: new items',
                              'yc-directory': 'HTML: company slugs on the page; diff the set (directory is client-rendered, so a slug-set diff is a weak signal)'}.get(r['kind'], 'blocked from sandbox; check manually or via WebSearch'),
                      path=os.path.relpath(r['path'], root)))
doc = {
    'generated': '2026-10-20',
    'lane': 'radar',
    'cadence': 'weekly (Monday 06:00 IST suggested); new-entrant sweep monthly per the brief, weekly is cheap enough',
    'how_to_run': 'Re-fetch every url with the same curl options as research/2026-10-20/teardown/radar/code/probe.py (inputs: code/watch-candidates*.tsv, code/sweep-sources.tsv) (UA Chrome 141, -L, 40 s timeout) into a new dated folder under data/teardown/radar/; compare to baseline.sha256 first, then run diff_method only on changed files. Never log in, never submit forms.',
    'deep_set': sorted(DEEP),
    'items': items,
    'new_entrant_sweep': {
        'sources': sweep,
        'queries': ['voice AI agent India seed OR "Series A"', 'AI telecalling startup funding', 'Hinglish voice agent launch',
                    'voice agents BFSI India raises', 'site:ycombinator.com/companies voice agents India', 'Show HN voice agent phone'],
        'keep_if': 'sells or plans to sell outbound/inbound phone or WhatsApp voice agents to Indian businesses, OR is a substrate (model, framework, telephony) Indian vendors adopt',
    },
    'triage_rubric': {
        'subscores_0_to_3': {
            'B_buyer_overlap (x3)': '0 none; 1 global with some India; 2 Indian SMB/mid-market; 3 Indian enterprise or BFSI/insurance with named customers',
            'T_indian_telephony (x2)': '0 none; 1 BYO SIP only; 2 documented Indian carrier integration; 3 owns Indian numbers/licence or 3+ Indian carriers',
            'L_indic_language_evidence (x2)': '0 English-only (measured) or nothing; 1 claim only; 2 published benchmark or measured-good demo; 3 measured good by us on our battery',
            'P_published_price_pressure (x1)': '0 quote-only; 1 published above INR 6/min; 2 published INR 4-6; 3 published at or below INR 4/min (or 2 cents)',
            'S_self_serve_surface (x1)': '0 demo-only; 1 managed/sandbox on request; 2 self-serve buy; 3 self-serve sign-up with free credits',
            'M_momentum_last_6_months (x1)': '0 stalled/shrinking; 1 minor or none; 2 round USD 1-10M or notable launch; 3 round >= USD 10M or major platform launch',
        },
        'threat_score': '1 + round(4 * (3B + 2T + 2L + P + S + M) / 30); eval tools and exited vendors are capped at 1',
        'promote_to_deep_set_if': [
            'threat >= 4, AND',
            'B >= 2 and T >= 2 (same Indian buyer, can actually place Indian calls), AND',
            'account-testable: self-serve sign-up or a public demo call (otherwise mark DESK-DEEP ONLY), AND',
            'it displaces the deep-set member that yields the least account-phase data for the three decisions',
        ],
        'beachhead_flag': 'separately flag any vendor naming insurance renewal or post-sale insurance servicing (decision 1), whatever its score: the rubric under-weights enterprise-only specialists',
        're_triage_triggers': ['funding >= USD 5M', 'published all-in price <= INR 4/min', 'Indian telephony integration launched',
                               'named Indian BFSI/insurer customer', 'self-serve launch', 'deep-set vendor goes enterprise-only'],
    },
}
json.dump(doc, open(out, 'w'), indent=1, ensure_ascii=False)
print(len(items), 'watch items;', len(sweep), 'sweep sources')
