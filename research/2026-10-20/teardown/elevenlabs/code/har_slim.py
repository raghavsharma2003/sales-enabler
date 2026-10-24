"""Slim a HAR for REA: drop response bodies and cookies, redact query tokens. Usage: python3 -I har_slim.py <in.har> <out.har>"""
import json, sys, re, urllib.parse
SAFE = ":/?#@!$&'()*+,;=%-._~"
h = json.load(open(sys.argv[1]))
for e in h['log']['entries']:
    u = re.sub(r'(token|signature|key|auth)=[^&]+', r'\1=REDACTED', e['request']['url'])
    e['request']['url'] = urllib.parse.quote(u, safe=SAFE)
    for side in ('request', 'response'):
        e[side]['cookies'] = []
        e[side]['headers'] = [x for x in e[side]['headers'] if x['name'].lower() not in ('cookie', 'set-cookie', 'authorization')]
    c = e['response'].get('content', {}); c.pop('text', None); c.pop('encoding', None)
    if 'postData' in e['request']: e['request']['postData'] = {'mimeType': e['request']['postData'].get('mimeType', ''), 'text': ''}
json.dump(h, open(sys.argv[2], 'w'))
print(len(h['log']['entries']), 'entries')
