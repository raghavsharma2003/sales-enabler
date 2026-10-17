# Fetch Azure Retail Prices API items for the l2-economics cost model.
# Usage: python3 -I fetch_prices.py OUTDIR
import json, sys, urllib.parse, urllib.request, time
OUT = sys.argv[1]
BASE = "https://prices.azure.com/api/retail/prices"
def q(filt, name, maxpages=40):
    items, url = [], BASE + "?api-version=2023-01-01-preview&$filter=" + urllib.parse.quote(filt)
    pages = 0
    while url and pages < maxpages:
        with urllib.request.urlopen(url, timeout=60) as r:
            d = json.load(r)
        items += d.get("Items", [])
        url = d.get("NextPageLink"); pages += 1
    json.dump({"filter": filt, "fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "n": len(items), "items": items}, open(f"{OUT}/{name}.json", "w"))
    print(name, len(items))
    return items
Q = {
 "speech": "serviceName eq 'Foundry Tools' and armRegionName eq 'centralindia'",
 "speech_sea": "serviceName eq 'Foundry Tools' and armRegionName eq 'southeastasia'",
 "foundry_models_ci": "serviceName eq 'Foundry Models' and armRegionName eq 'centralindia'",
 "foundry_models_global": "serviceName eq 'Foundry Models' and armRegionName eq 'eastus2'",
 "aca_ci": "serviceName eq 'Azure Container Apps' and armRegionName eq 'centralindia'",
 "aca_eus2": "serviceName eq 'Azure Container Apps' and armRegionName eq 'eastus2'",
 "acs_voice": "serviceName eq 'Voice'",
}
for k, f in Q.items():
    try: q(f, k)
    except Exception as e: print(k, "ERR", e)
