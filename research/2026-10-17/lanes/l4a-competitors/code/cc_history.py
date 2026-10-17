#!/usr/bin/env python3
"""Pricing-page history from Common Crawl (substitute for Wayback CDX, which the sandbox egress blocks).
Binary-searches each crawl's cluster.idx with HTTP range requests on data.commoncrawl.org, pulls the
matching CDX block, then the WARC record for each 200 capture. Usage:
  python3 -I cc_history.py OUTDIR CRAWL1,CRAWL2,... url1 url2 ...
"""
import sys, os, gzip, io, json, re, time, urllib.request, ssl, zlib
BASE = "https://data.commoncrawl.org/"
ctx = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
proxy = urllib.request.ProxyHandler({"https": os.environ.get("HTTPS_PROXY", "")})
opener = urllib.request.build_opener(proxy, urllib.request.HTTPSHandler(context=ctx))
SIZES = {}

def rng(path, start, end, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(BASE + path, headers={"Range": f"bytes={start}-{end}", "User-Agent": "vp-research/0.1"})
            with opener.open(req, timeout=60) as r:
                return r.read()
        except Exception as e:
            time.sleep(2 * (i + 1))
            err = e
    raise err

def size(path):
    if path in SIZES: return SIZES[path]
    req = urllib.request.Request(BASE + path, method="HEAD")
    with opener.open(req, timeout=60) as r:
        SIZES[path] = int(r.headers["Content-Length"])
    return SIZES[path]

def surt(url):
    url = re.sub(r"^https?://", "", url).rstrip("/")
    host, _, path = url.partition("/")
    host = host.lower()
    if host.startswith("www."): host = host[4:]
    return ",".join(reversed(host.split("."))) + ")/" + path.lower()

def line_at(path, pos, total):
    """Return (line, line_start) of the first full line starting at/after pos."""
    chunk = rng(path, pos, min(pos + 8191, total - 1))
    if pos == 0:
        nl = -1
    else:
        nl = chunk.find(b"\n")
        if nl < 0: return None, None
    rest = chunk[nl + 1:]
    nl2 = rest.find(b"\n")
    if nl2 < 0: return None, None
    return rest[:nl2].decode("utf-8", "replace"), pos + nl + 1

def find_blocks(crawl, key):
    path = f"cc-index/collections/{crawl}/indexes/cluster.idx"
    total = size(path)
    lo, hi = 0, total
    best = None
    while hi - lo > 8192:
        mid = (lo + hi) // 2
        line, start = line_at(path, mid, total)
        if line is None: hi = mid; continue
        k = line.split(" ")[0]
        if k < key:
            best = (line, start); lo = mid
        else:
            hi = mid
    # scan linearly the remaining window
    chunk = rng(path, lo, min(lo + 16383, total - 1)).decode("utf-8", "replace").split("\n")[1:-1]
    cands = []
    for ln in chunk:
        k = ln.split(" ")[0]
        if k < key: cands = [ln]
        elif k.startswith(key.split("?")[0]) or k == key: cands.append(ln)
        else:
            cands.append(ln); break
    if not cands and best: cands = [best[0]]
    out = []
    for ln in cands[:3]:
        parts = ln.split("\t")
        if len(parts) >= 4:
            out.append((parts[1], int(parts[2]), int(parts[3])))
    return out

def cdx_lines(crawl, key):
    res = []
    for fn, off, ln in find_blocks(crawl, key):
        data = rng(f"cc-index/collections/{crawl}/indexes/{fn}", off, off + ln - 1)
        txt = zlib.decompress(data, 16 + zlib.MAX_WBITS).decode("utf-8", "replace")
        for l in txt.split("\n"):
            k = l.split(" ")[0]
            if k == key or k == key + "/":
                res.append(l)
    return res

def warc(rec):
    data = rng(rec["filename"], int(rec["offset"]), int(rec["offset"]) + int(rec["length"]) - 1)
    raw = zlib.decompress(data, 16 + zlib.MAX_WBITS)
    parts = raw.split(b"\r\n\r\n", 2)
    return parts[2] if len(parts) == 3 else raw

def text_of(html):
    h = html.decode("utf-8", "replace")
    h = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", h)
    t = re.sub(r"<[^>]+>", " ", h)
    t = re.sub(r"&nbsp;", " ", t); t = re.sub(r"&amp;", "&", t); t = re.sub(r"&#x27;|&#39;", "'", t)
    return re.sub(r"\s+", " ", t)

if __name__ == "__main__":
    outdir = sys.argv[1]; crawls = sys.argv[2].split(","); urls = sys.argv[3:]
    os.makedirs(outdir, exist_ok=True)
    log = []
    for url in urls:
        key = surt(url)
        for c in crawls:
            try:
                lines = cdx_lines(c, key)
            except Exception as e:
                log.append({"url": url, "crawl": c, "error": str(e)[:200]}); continue
            got = False
            for l in lines:
                js = json.loads(l.split(" ", 2)[2])
                if js.get("status") != "200": continue
                ts = l.split(" ")[1]
                try:
                    body = warc(js)
                except Exception as e:
                    log.append({"url": url, "crawl": c, "ts": ts, "error": str(e)[:200]}); continue
                fn = os.path.join(outdir, f"{key.replace('/', '_').replace(')', '').replace(',', '.')}__{ts}")
                open(fn + ".html", "wb").write(body)
                open(fn + ".txt", "w").write(text_of(body))
                log.append({"url": url, "crawl": c, "ts": ts, "bytes": len(body), "file": fn + ".txt"})
                got = True
                break
            if not got:
                log.append({"url": url, "crawl": c, "captures": len(lines), "note": "no 200 capture"})
            print(json.dumps(log[-1]), flush=True)
    json.dump(log, open(os.path.join(outdir, "_log.json"), "w"), indent=1)
