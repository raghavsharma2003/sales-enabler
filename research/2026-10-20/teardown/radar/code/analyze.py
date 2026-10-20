"""Summarise scanned pages: stack signals from request hosts + keyword hits in rendered text.
Usage: python3 -I analyze.py <radar_root> [vendor ...]"""
import json, os, re, sys, glob

root = sys.argv[1]
only = set(sys.argv[2:])
SIG = [
    ('livekit', r'livekit'), ('daily', r'daily\.co|pipecat'), ('twilio', r'twilio'), ('vapi', r'vapi\.ai'),
    ('retell', r'retellai'), ('elevenlabs', r'elevenlabs'), ('ultravox', r'ultravox'), ('agora', r'agora'),
    ('deepgram', r'deepgram'), ('cartesia', r'cartesia'), ('openai', r'openai'), ('plivo', r'plivo'),
    ('exotel', r'exotel'), ('webflow', r'webflow|website-files'), ('framer', r'framer'), ('nextjs', r'_next'),
    ('vercel', r'vercel'), ('wordpress', r'wp-content|wordpress'), ('hubspot', r'hubspot|hs-scripts|hsforms'),
    ('intercom', r'intercom'), ('cloudflare', r'cloudflare|cdn-cgi'), ('cloudfront', r'cloudfront'),
    ('google-tag', r'googletagmanager|google-analytics'), ('posthog', r'posthog'), ('segment', r'segment\.(io|com)'),
    ('sentry', r'sentry'), ('clarity', r'clarity\.ms'), ('calendly', r'calendly'), ('chili', r'chilipiper'),
    ('zoho', r'zoho'), ('freshworks', r'freshchat|freshworks'), ('leadsquared', r'leadsquared'),
    ('sanity', r'sanity'), ('contentful', r'contentful'), ('mintlify', r'mintlify'), ('stripe', r'stripe'),
]
KW = {
    'inr_price': r'(₹|INR|Rs\.?)\s?[0-9][0-9,\.]*',
    'usd_price': r'\$\s?[0-9][0-9,\.]*\s*(/|per)\s*(min|minute)',
    'per_min': r'per (connected )?min(ute)?|/min\b',
    'hindi_hinglish': r'Hindi|Hinglish|हिंदी|Indic|Indian languages|vernacular',
    'india_tel': r'Exotel|Plivo|Vobiz|Knowlarity|Tata Tele|Smartflo|Airtel|Jio|Ozonetel|MyOperator|Servetel|Twilio|Telnyx|SIP',
    'compliance': r'TRAI|DLT|DND|NCPR|DPDP|consent|140[- ]series|160[- ]series|1600|calling hours',
    'certs': r'SOC ?2|ISO ?27001|HIPAA|GDPR|PCI',
    'residency': r'on[- ]prem|data residency|India region|hosted in India|air[- ]gapped|sovereign|VPC',
    'latency_ms': r'[0-9]{2,4}\s?ms\b',
    'whatsapp': r'WhatsApp',
    'memory': r'memory|remembers|context across',
    'languages_n': r'[0-9]{1,3}\+?\s+(languages|Indian languages|dialects)',
    'customers': r'trusted by|customers|clients|brands',
    'funding': r'Series [A-D]|seed|raised|funding',
    'eval': r'simulat|test(ing)? (calls|agents)|QA|evaluation|evals',
    'self_serve': r'sign ?up|get started|start (for )?free|free trial|try (it )?free|credits',
}
for d in sorted(glob.glob(os.path.join(root, '*', 'web'))):
    vendor = d.split(os.sep)[-2]
    if only and vendor not in only:
        continue
    for jf in sorted(glob.glob(os.path.join(d, '*.json'))):
        r = json.load(open(jf))
        print('=' * 100)
        print(vendor, r.get('url'), '->', r.get('finalUrl'), r.get('status'), '|', (r.get('title') or '')[:90], '| err:', r.get('error', ''))
        hosts = r.get('hosts', {})
        third = sorted(h for h in hosts)
        sig = sorted({n for n, p in SIG for h in list(hosts) + r.get('scripts', []) + r.get('iframes', []) if re.search(p, h, re.I)})
        print('  signals:', sig)
        print('  hosts:', ', '.join(third)[:500])
        if r.get('websockets'):
            print('  ws:', r['websockets'])
        if r.get('gen'):
            print('  generator:', r['gen'])
        cust = [c for c in r.get('custom', []) if not c.startswith(('svg', 'font'))][:15]
        if cust:
            print('  custom-el:', cust)
        hd = r.get('headers', {})
        print('  hdr:', {k: hd[k] for k in hd if k in ('server', 'x-powered-by', 'via', 'x-vercel-id', 'cf-ray', 'x-amz-cf-pop', 'x-served-by', 'x-nf-request-id')})
        tf = jf[:-5] + '.txt'
        if os.path.exists(tf):
            t = open(tf, errors='ignore').read()
            print('  text-chars:', len(t))
            for k, p in KW.items():
                hits = []
                for m in re.finditer(p, t, re.I):
                    s = max(0, m.start() - 60); e = min(len(t), m.end() + 60)
                    hits.append(t[s:e].replace('\n', ' '))
                if hits:
                    print(f'  [{k}] n={len(hits)} :: ' + ' || '.join(hits[:3])[:520])
