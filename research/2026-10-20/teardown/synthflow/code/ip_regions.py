"""Map every IPv4 address in the Synthflow IP allow-list doc to a GCP region using Google's published cloud.json.
Usage: python3 -I ip_regions.py <ip-allow-lists.md> <gcp-cloud.json> <out.csv>"""
import csv, ipaddress, json, re, sys
md = open(sys.argv[1], encoding="utf-8").read()
cloud = json.load(open(sys.argv[2]))
nets = [(ipaddress.ip_network(p["ipv4Prefix"]), p.get("scope"), p.get("service")) for p in cloud["prefixes"] if "ipv4Prefix" in p]
section = None
rows = []
for line in md.splitlines():
    h = re.match(r"^#{2,4} (.+)$", line)
    if h:
        section = h.group(1).strip()
        continue
    sub = re.match(r"^\*\*(Signaling|Media).*\*\*", line)
    if sub:
        kind = sub.group(1)
    for ip in re.findall(r"\b(\d{1,3}(?:\.\d{1,3}){3})(?:/32)?\b", line):
        a = ipaddress.ip_address(ip)
        hit = next(((str(n), s) for n, s, _ in nets if a in n), (None, None))
        rows.append({"section": section, "ip": ip, "gcp_prefix": hit[0], "gcp_scope": hit[1] or "not-in-gcp-cloud.json"})
with open(sys.argv[3], "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=["section", "ip", "gcp_prefix", "gcp_scope"])
    w.writeheader(); w.writerows(rows)
from collections import Counter
print(cloud.get("creationTime"))
for (sec, sc), n in sorted(Counter((r["section"], r["gcp_scope"]) for r in rows).items(), key=lambda x: str(x)):
    print(f"{sec:30s} {sc:28s} {n}")
