"""Copy a Playwright HAR with request/response URLs made RFC 3986-valid (percent-encode [ ] | { } ^ ` " space and non-ASCII),
so REA's strict HAR schema accepts it. Usage: python3 -I har_sanitize.py <in.har> <out.har>"""
import json, sys, urllib.parse

SAFE = "!#$%&'()*+,-./:;=?@_~" + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

def fix(u):
    return ''.join(c if c in SAFE else urllib.parse.quote(c, safe='') for c in u)

h = json.load(open(sys.argv[1]))
n = 0
for e in h['log']['entries']:
    for k in ('request',):
        u = e[k]['url']
        f = fix(u)
        if f != u:
            e[k]['url'] = f; n += 1
    r = e.get('response', {})
    if r.get('redirectURL'):
        f = fix(r['redirectURL'])
        if f != r['redirectURL']:
            r['redirectURL'] = f; n += 1
json.dump(h, open(sys.argv[2], 'w'))
print('fixed', n, 'urls of', len(h['log']['entries']), 'entries')
