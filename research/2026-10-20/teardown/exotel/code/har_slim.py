"""Slim a Playwright HAR for REA: drop response bodies, cookies and query strings' values. Usage: python3 -I har_slim.py in.har out.har"""
import sys, json, re
h = json.load(open(sys.argv[1]))
for e in h['log']['entries']:
    r = e['request']; r['cookies'] = []; r['headers'] = [x for x in r['headers'] if x['name'].lower() not in ('cookie', 'authorization')]
    r['url'] = re.sub(r'([?&][^=&]+=)[^&]*', r'\1REDACTED', r['url']); r['queryString'] = []
    s = e['response']; s['cookies'] = []; s['headers'] = [x for x in s['headers'] if x['name'].lower() != 'set-cookie']
    c = s.get('content', {}); c.pop('text', None); c.pop('encoding', None)
    if 'postData' in r: r['postData'] = {'mimeType': r['postData'].get('mimeType', ''), 'text': ''}
json.dump(h, open(sys.argv[2], 'w'))
print(len(h['log']['entries']))
