"""Verifier check (2026-10-20): match saved DoH A records to GCP cloud.json prefixes. Usage: python3 -I verify_ipmatch.py <net dir>"""
import json, sys, ipaddress, glob, os
netdir = sys.argv[1]
cloud = json.load(open(os.path.join(netdir, 'gcp-cloud.json')))
goog = json.load(open(os.path.join(netdir, 'goog.json')))
print('cloud.json creationTime', cloud.get('creationTime'), 'syncToken', cloud.get('syncToken'), 'n', len(cloud['prefixes']))
pref = []
for p in cloud['prefixes']:
    if 'ipv4Prefix' in p:
        pref.append((ipaddress.ip_network(p['ipv4Prefix']), p.get('scope'), p.get('service')))
gpref = [ipaddress.ip_network(p['ipv4Prefix']) for p in goog['prefixes'] if 'ipv4Prefix' in p]
for f in sorted(glob.glob(os.path.join(netdir, 'doh-*.json'))):
    d = json.load(open(f))
    for a in d.get('Answer', []):
        if a.get('type') != 1: continue
        ip = ipaddress.ip_address(a['data'])
        m = [(str(n), s) for n, s, _ in pref if ip in n]
        best = max(m, key=lambda x: ipaddress.ip_network(x[0]).prefixlen) if m else None
        g = any(ip in n for n in gpref)
        print(f"{a['name']:45s} {a['data']:16s} cloud={best} in_goog={g}")
