"""Extract INR and USD list prices from Zoho's own price JSON (zohowebstatic.com), fetched 2026-10-17.
Usage: python3 -I code/zoho_prices.py <raw_dir> data/zoho-inr-prices.csv"""
import json, csv, sys, os
raw, out = sys.argv[1], sys.argv[2]
rows=[]
for p in ['crm','one','voice','desk','salesiq']:
    d=json.load(open(os.path.join(raw,f'zoho-{p}-pricing.json')))['priceLists']
    order=d['currencyOrder'].split(';'); i=order.index('INR'); u=order.index('USD')
    for s in d['priceSets']:
        v=s['priceValue'].split('//')[0].split(';')
        if len(v)>max(i,u):
            rows.append({'file':f'https://www.zohowebstatic.com/sites/zweb/json/pricing/{p}-pricing-val.json','set_id':s['setId'],'inr':v[i],'usd':v[u],'accessed':'2026-10-17','method':'read-primary (vendor price JSON)'})
with open(out,'w',newline='') as fh:
    w=csv.DictWriter(fh,fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
print(len(rows))
