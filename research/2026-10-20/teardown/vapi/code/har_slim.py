"""Write a slim copy of a HAR (drop response bodies larger than a limit or from third-party hosts) so REA's 32 MB input budget accepts it.
Usage: python3 -I har_slim.py <in.har> <out.har> <keep-host-substring> [maxBodyBytes]"""
import json, sys
src, dst, keep = sys.argv[1], sys.argv[2], sys.argv[3]
lim = int(sys.argv[4]) if len(sys.argv) > 4 else 200000
h = json.load(open(src)); dropped = 0
for e in h['log']['entries']:
    c = e.get('response', {}).get('content', {})
    t = c.get('text')
    if t is None: continue
    if keep not in e['request']['url'] or len(t) > lim:
        c.pop('text', None); c.pop('encoding', None); c['comment'] = 'body dropped by har_slim.py'; dropped += 1
json.dump(h, open(dst, 'w'))
print('dropped bodies', dropped, 'of', len(h['log']['entries']))
