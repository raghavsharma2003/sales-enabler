"""sha256 manifest of every raw artifact under data/teardown/synthflow. Usage: python3 -I build_manifest.py <root> <out.csv>"""
import csv, datetime, hashlib, os, re, sys
root, out = sys.argv[1], sys.argv[2]
base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(root))))  # repo root
def src(rel):
    d, f = rel.split("/", 1) if "/" in rel else ("", rel)
    name = os.path.basename(rel)
    if d == "docs":
        if name == "sitemap-extra-urls.txt": return "derived: docs sitemap minus llms.txt"
        return "https://" + name.replace("_", "/", 1).replace("docs.synthflow.ai/", "docs.synthflow.ai/").replace("synthflow.ai_", "synthflow.ai/")
    if d == "docs-md":
        if name.startswith("_fetch"): return "derived: fetch log"
        return "https://docs.synthflow.ai/" + name[:-3].replace("__", "/") + ".md"
    if d == "openapi": return "https://docs.synthflow.ai/openapi.json"
    if d == "site":
        if name == "sitemap-urls.txt": return "derived from https://synthflow.ai/sitemap.xml"
        if name == "home.html": return "https://synthflow.ai/"
        if name == "careers.html": return "https://synthflow.ai/careers"
        return "https://synthflow.ai/" + name[:-5]
    if d == "capture":
        pg = {"home": "https://synthflow.ai/", "login": "https://fine-tuner.ai/auth", "app": "https://app.synthflow.ai/"}
        return "playwright passive capture of " + pg.get(name.split(".")[0], "?")
    if d == "extracted":
        har = "capture/app.har" if rel.startswith("extracted/app/") else "capture/home.har"
        return f"response body from data/teardown/synthflow/{har}; filename = request URL with / and ? replaced by _"
    if d == "ipranges":
        if name == "gcp-cloud.json": return "https://www.gstatic.com/ipranges/cloud.json"
        if name.startswith("rdap"): return "https://rdap.arin.net/registry/ip/4.138.180.50"
        return "https://dns.google/resolve (DoH A records)"
    if d == "status":
        return "https://" + name[:-4].replace("_", "/")
    if d in ("jobs", "feedback"):
        try:
            first = open(os.path.join(root, rel), encoding="utf-8").readline().strip()
            return first.replace("URL: ", "")
        except Exception:
            return "rendered page text"
    if d == "complaints": return "https://www.trustpilot.com/review/synthflow.ai?stars=1&stars=2 (WebFetch extraction)"
    if d == "sdk-n8n": return "npm pack @synthflow-ai/n8n-nodes-synthflow@0.2.3"
    if d == "rea": return "local: rea-agents@latest output"
    return "local"
rows = []
for dp, dn, fn in os.walk(root):
    for f in sorted(fn):
        p = os.path.join(dp, f)
        rel = os.path.relpath(p, root)
        h = hashlib.sha256(open(p, "rb").read()).hexdigest()
        st = os.stat(p)
        rows.append({"path": os.path.relpath(p, base), "bytes": st.st_size, "sha256": h, "source_url": src(rel),
                     "fetched_at": datetime.datetime.fromtimestamp(st.st_mtime, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
rows.sort(key=lambda r: r["path"])
with open(out, "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=["path", "bytes", "sha256", "source_url", "fetched_at"]); w.writeheader(); w.writerows(rows)
print(len(rows), "files", sum(r["bytes"] for r in rows), "bytes")
