"""Extract response bodies from a HAR for selected URL substrings into an output dir (no execution).
Usage: python3 -I har_extract.py <har> <outdir> <substr> [<substr>...]"""
import base64, hashlib, json, os, re, sys
har, out, subs = sys.argv[1], sys.argv[2], sys.argv[3:]
os.makedirs(out, exist_ok=True)
for e in json.load(open(har))["log"]["entries"]:
    u = e["request"]["url"]
    if not any(s in u for s in subs):
        continue
    c = e["response"].get("content", {})
    t = c.get("text")
    if t is None:
        continue
    b = base64.b64decode(t) if c.get("encoding") == "base64" else t.encode("utf-8", "replace")
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", u.split("://", 1)[-1].split("?")[0])[:150]
    p = os.path.join(out, name)
    open(p, "wb").write(b)
    print(len(b), hashlib.sha256(b).hexdigest()[:12], p, "<-", u[:120])
