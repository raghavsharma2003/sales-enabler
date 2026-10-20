"""Redact credentials/tokens from a HAR and drop large bodies. Usage: python3 -I har_redact.py <in.har> <out.har> [maxBody]"""
import json, sys, re, base64
src, dst = sys.argv[1], sys.argv[2]; lim = int(sys.argv[3]) if len(sys.argv) > 3 else 300000
KEYS = r'(credential|username|sigAuthz|token|callToken|meetingToken|webCallUrl|password|usernameFragment|jwtSecret)'
pat = re.compile(r'("%s"\s*:\s*")[^"]*(")' % KEYS)
def red(s): return pat.sub(r'\1<redacted>\2', s)
h = json.load(open(src)); n = 0
for e in h['log']['entries']:
    for side in ('request', 'response'):
        for hd in e[side].get('headers', []):
            if hd['name'].lower() in ('authorization', 'cookie', 'set-cookie', 'x-vapi-secret'): hd['value'] = '<redacted>'; n += 1
        e[side]['cookies'] = []
    pdt = e['request'].get('postData')
    if pdt and 'text' in pdt: pdt['text'] = red(pdt['text'])
    e['request']['url'] = re.sub(r'([?&](t|token|sigAuthz)=)[^&]+', r'\1<redacted>', e['request']['url'])
    c = e['response'].get('content', {})
    if 'text' in c:
        if len(c['text']) > lim: c.pop('text'); c.pop('encoding', None); c['comment'] = 'body dropped (size)'; continue
        t = c['text']
        if c.get('encoding') == 'base64':
            try: t = base64.b64decode(t).decode('utf-8'); c.pop('encoding')
            except Exception: c.pop('text'); c.pop('encoding', None); c['comment'] = 'binary body dropped'; continue
        c['text'] = red(t)
for ws in h['log']['entries']:
    for m in ws.get('_webSocketMessages', []) or []:
        m['data'] = red(m.get('data', ''))
json.dump(h, open(dst, 'w')); print('redacted headers', n)
