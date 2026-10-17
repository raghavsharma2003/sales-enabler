# Second batch: GPU VMs, storage, MAI transcribe. Usage: python3 -I fetch_prices2.py OUTDIR
import json, sys, urllib.parse, urllib.request, time
OUT = sys.argv[1]
BASE = "https://prices.azure.com/api/retail/prices"
def q(filt, maxpages=30):
    items, url, pages = [], BASE + "?api-version=2023-01-01-preview&$filter=" + urllib.parse.quote(filt), 0
    while url and pages < maxpages:
        with urllib.request.urlopen(url, timeout=60) as r: d = json.load(r)
        items += d.get("Items", []); url = d.get("NextPageLink"); pages += 1
    return items
res = {}
skus = ["Standard_NC4as_T4_v3","Standard_NC8as_T4_v3","Standard_NC16as_T4_v3","Standard_NV36ads_A10_v5","Standard_NV72ads_A10_v5","Standard_NV18ads_A10_v5","Standard_NC24ads_A100_v4","Standard_NC40ads_H100_v5","Standard_ND96isr_H100_v5","Standard_NC80adis_H100_v5","Standard_ND96isr_H200_v5","Standard_NC16ads_A10_v4"]
regions = ["centralindia","southindia","westindia","eastus2","southeastasia","eastus"]
for s in skus:
    f = f"serviceName eq 'Virtual Machines' and armSkuName eq '{s}' and priceType eq 'Consumption'"
    it = q(f); res[s] = [i for i in it if i["armRegionName"] in regions]
    print(s, len(it), len(res[s]))
res["mai"] = q("contains(meterName, 'Transcribe')")
print("mai", len(res["mai"]))
res["blob_ci"] = q("serviceName eq 'Storage' and armRegionName eq 'centralindia' and contains(meterName, 'Hot LRS')")
res["blob_ci_cool"] = q("serviceName eq 'Storage' and armRegionName eq 'centralindia' and contains(meterName, 'Cool LRS')")
print("blob", len(res["blob_ci"]), len(res["blob_ci_cool"]))
res["loganalytics_ci"] = q("serviceName eq 'Log Analytics' and armRegionName eq 'centralindia'")
res["bandwidth"] = q("serviceName eq 'Bandwidth' and armRegionName eq 'centralindia'")
print("la", len(res["loganalytics_ci"]), "bw", len(res["bandwidth"]))
res["_fetched"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
json.dump(res, open(f"{OUT}/prices2.json","w"))
