"""Resolve Synthflow hostnames via DNS-over-HTTPS (dns.google JSON API) and map A records to GCP regions / known nets.
Usage: python3 -I dns_map.py <gcp-cloud.json> <out.json> host..."""
import ipaddress, json, sys, urllib.request
cloud = json.load(open(sys.argv[1]))
nets = [(ipaddress.ip_network(p["ipv4Prefix"]), p.get("scope")) for p in cloud["prefixes"] if "ipv4Prefix" in p]
CF = [ipaddress.ip_network(n) for n in ("104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "188.114.96.0/20", "162.158.0.0/15", "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "198.41.128.0/17", "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "131.0.72.0/22", "197.234.240.0/22")]
out = {}
for h in sys.argv[3:]:
    rec = {"A": [], "CNAME": []}
    try:
        with urllib.request.urlopen(f"https://dns.google/resolve?name={h}&type=A", timeout=15) as r:
            d = json.load(r)
        for a in d.get("Answer", []):
            if a["type"] == 5: rec["CNAME"].append(a["data"])
            if a["type"] == 1:
                ip = ipaddress.ip_address(a["data"])
                scope = next((s for n, s in nets if ip in n), None)
                if scope is None and any(ip in n for n in CF): scope = "cloudflare"
                rec["A"].append({"ip": a["data"], "where": scope or "other"})
    except Exception as e:
        rec["error"] = str(e)
    out[h] = rec
    print(h, rec["CNAME"], [(x["ip"], x["where"]) for x in rec["A"]], rec.get("error", ""))
json.dump(out, open(sys.argv[2], "w"), indent=1)
