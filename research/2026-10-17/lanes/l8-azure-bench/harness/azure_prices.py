# Fetch Azure Retail Prices (public, no auth) for the meters this lane needs. Usage: python azure_prices.py OUT_CSV
import sys, time, csv, requests
out = sys.argv[1]
Q = {
 'models_sea': "serviceName eq 'Foundry Models' and armRegionName eq 'southeastasia'",
 'models_eastus': "serviceName eq 'Foundry Models' and armRegionName eq 'eastus'",
 'models_eastus2': "serviceName eq 'Foundry Models' and armRegionName eq 'eastus2'",
 'models_global': "serviceName eq 'Foundry Models' and armRegionName eq 'Global'",
 'speech_sea': "serviceName eq 'Foundry Tools' and productName eq 'Azure Speech' and armRegionName eq 'southeastasia'",
 'speech_eastus': "serviceName eq 'Foundry Tools' and productName eq 'Azure Speech' and armRegionName eq 'eastus'",
 'speech_centralindia': "serviceName eq 'Foundry Tools' and productName eq 'Azure Speech' and armRegionName eq 'centralindia'",
}
rows = []
for name, flt in Q.items():
  url = 'https://prices.azure.com/api/retail/prices'; params = {'api-version': '2023-01-01-preview', '$filter': flt}
  n = 0
  while url:
    for i in range(4):
      try:
        r = requests.get(url, params=params, timeout=90); r.raise_for_status(); d = r.json(); break
      except Exception as e:
        err = e; time.sleep(3 * (i + 1))
    else:
      print(name, 'ERR', err); break
    for it in d.get('Items', []):
      rows.append({'query': name, 'serviceName': it.get('serviceName'), 'productName': it.get('productName'), 'meterName': it.get('meterName'), 'skuName': it.get('skuName'), 'armRegionName': it.get('armRegionName'), 'type': it.get('type'), 'retailPrice_usd': it.get('retailPrice'), 'unitOfMeasure': it.get('unitOfMeasure'), 'tierMinimumUnits': it.get('tierMinimumUnits'), 'effectiveStartDate': it.get('effectiveStartDate'), 'fetched': time.strftime('%Y-%m-%d')}); n += 1
    url = d.get('NextPageLink'); params = None
  print(name, n, flush=True)
with open(out, 'w', newline='') as f:
  w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
