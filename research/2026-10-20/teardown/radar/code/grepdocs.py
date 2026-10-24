"""Strip HTML to text (stdlib) and grep for patterns with context. Usage: python3 -I grepdocs.py <regex> <file>..."""
import re, sys, html
from html.parser import HTMLParser

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.out = []; self.skip = 0
    def handle_starttag(self, t, a):
        if t in ('script', 'style', 'noscript'): self.skip += 1
    def handle_endtag(self, t):
        if t in ('script', 'style', 'noscript') and self.skip: self.skip -= 1
    def handle_data(self, d):
        if not self.skip: self.out.append(d)

pat = re.compile(sys.argv[1], re.I)
for f in sys.argv[2:]:
    raw = open(f, errors='ignore').read()
    if '<html' in raw[:5000].lower() or '<!doctype' in raw[:200].lower():
        p = P(); p.feed(raw); t = ' '.join(p.out)
    else:
        t = raw
    t = re.sub(r'\s+', ' ', html.unescape(t))
    hits = [m for m in pat.finditer(t)]
    print(f'== {f.split("/")[-1]} chars={len(t)} hits={len(hits)}')
    last = -1000
    for m in hits:
        if m.start() - last < 200: continue
        last = m.start()
        print('   ..', t[max(0, m.start() - 140): m.end() + 200])
