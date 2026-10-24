"""Strip an HTML file to visible text (read-only; stdlib only; run with python3 -I).

usage: python3 -I html2text.py <in.html> <out.txt>
"""
import sys
from html.parser import HTMLParser


class T(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg"):
            self.skip += 1
        if tag in ("p", "div", "br", "li", "h1", "h2", "h3", "h4", "tr", "section"):
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip and data.strip():
            self.out.append(data.strip() + " ")


p = T()
p.feed(open(sys.argv[1], encoding="utf-8", errors="replace").read())
text = "".join(p.out)
lines = [ln.strip() for ln in text.split("\n")]
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(ln for ln in lines if ln))
