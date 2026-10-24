"""Build manifest.csv (path,bytes,sha256,source_url,fetched_at) for every raw artifact under data/teardown/retell.

usage: python3 -I build_manifest.py <repo_root> <out.csv>
source_url is mapped from the file name; fetched_at is the file mtime (UTC).
"""
import csv
import hashlib
import os
import sys
from datetime import datetime, timezone

root, out = sys.argv[1], sys.argv[2]
base = os.path.join(root, "data/teardown/retell")

WEB = {
    "www.retellai.com": "https://www.retellai.com/",
    "www.retellai.com_pricing": "https://www.retellai.com/pricing",
    "www.retellai.com_changelog": "https://www.retellai.com/changelog",
    "www.retellai.com_robots.txt": "https://www.retellai.com/robots.txt",
    "www.retellai.com_sitemap.xml": "https://www.retellai.com/sitemap.xml",
    "www.retellai.com_llms.txt": "https://www.retellai.com/llms.txt",
    "www.retellai.com_security": "https://www.retellai.com/security (404)",
    "www.retellai.com_careers": "https://www.retellai.com/careers",
    "status.retellai.com": "https://status.retellai.com/",
    "status.retellai.com_history.rss": "https://status.retellai.com/history.rss",
    "status.retellai.com_feed.rss": "https://status.retellai.com/feed.rss",
    "status.retellai.com_api_v2_incidents.json": "https://status.retellai.com/api/v2/incidents.json",
    "bench.retellai.com": "https://bench.retellai.com/",
}


def source_for(rel):
    name = os.path.basename(rel)
    d = rel.split("/")[3] if rel.count("/") >= 3 else ""
    stem = name
    for suf in (".raw", ".txt"):
        if stem.endswith(suf):
            stem = stem[: -len(suf)]
            break
    if d == "web":
        url = WEB.get(stem)
        if url:
            return url + (" (bearer credential redacted)" if name.endswith(".raw") and stem.startswith("www.") else "") + (" (text extract)" if name.endswith(".txt") and not name.endswith("llms.txt.raw") else "")
        return "derived"
    if d == "docs":
        if name.startswith("docs.retellai.com_"):
            return "https://docs.retellai.com/" + name[len("docs.retellai.com_"):]
        if "/pages/" in rel:
            if name == "_index.tsv":
                return "derived from https://docs.retellai.com/llms-full.txt"
            return "https://docs.retellai.com/" + name[:-3].replace("__", "/") + " (split from llms-full.txt)"
        return "derived from https://docs.retellai.com/openapi.yaml"
    if d == "dns":
        if name == "aws-ip-ranges.json":
            return "https://ip-ranges.amazonaws.com/ip-ranges.json"
        if name.startswith("doh_"):
            host, typ = name[4:-5].rsplit("_", 1)
            return f"https://dns.google/resolve?name={host}&type={typ}"
        if name.startswith("rdap_"):
            return "https://rdap.org/ip/" + name[5:-5]
    if d == "complaints":
        if name.startswith("search_"):
            return "https://community.retellai.com/search.json?q=" + name[7:-5]
        if name.startswith("t_"):
            return "https://community.retellai.com/t/" + name[2:-5] + ".json"
        if name.startswith("trustpilot"):
            return "https://www.trustpilot.com/review/retellai.com (403 blocked)"
    if d == "jobs":
        return "https://api.ashbyhq.com/posting-api/job-board/retell-ai?includeCompensation=true"
    if d == "sdk":
        if "client-js" in rel:
            return "npm pack retell-client-js-sdk@3.0.2 (https://registry.npmjs.org/retell-client-js-sdk)"
        if "/py/" in rel:
            return "pip download --no-deps retell-sdk (https://pypi.org/project/retell-sdk/)"
        if name.startswith("npm-view"):
            return "npm view (https://registry.npmjs.org/)"
    if d == "har":
        return "Playwright capture of https://dashboard.retellai.com/ (redirects to auth.retellai.com); bodies and cookies stripped"
    if d == "status":
        return "derived from https://status.retellai.com/api/v2/incidents.json"
    if d == "rea":
        return "REA 6.7.0 output (npx rea-agents@latest)"
    return "derived"


rows = []
for dp, _, fns in os.walk(base):
    for fn in sorted(fns):
        p = os.path.join(dp, fn)
        rel = os.path.relpath(p, root)
        h = hashlib.sha256(open(p, "rb").read()).hexdigest()
        st = os.stat(p)
        ts = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows.append([rel, st.st_size, h, source_for(rel), ts])
rows.sort()
with open(out, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["path", "bytes", "sha256", "source_url", "fetched_at"])
    w.writerows(rows)
print(len(rows), "files,", sum(r[1] for r in rows), "bytes")
