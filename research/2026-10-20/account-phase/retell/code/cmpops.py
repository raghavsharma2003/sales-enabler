import json,re
ops=json.load(open('/home/user/sales-enabler/data/account-phase/retell/derived/sdk-ts-ops-raw.json'))
def norm(p):
    p=p.strip('`\'"'); p=re.sub(r'^path','',p).strip('`')
    p=re.sub(r'\$\{[^}]*\}','{}',p); return p
sdk={(m,norm(p)) for _,_,m,p in ops}
oa=json.load(open('/home/user/sales-enabler/data/teardown/retell/docs/openapi-summary.json'))['ops']
oas={(o['method'],re.sub(r'\{[^}]*\}','{}',o['path'])) for o in oa}
print(len(sdk),len(oas))
print('SDK only:',sorted(sdk-oas))
print('OpenAPI only:',sorted(oas-sdk))
json.dump({'sdk_only':sorted(sdk-oas),'openapi_only':sorted(oas-sdk),'sdk_n':len(sdk),'openapi_n':len(oas)},open('/home/user/sales-enabler/data/account-phase/retell/derived/sdk-vs-openapi.json','w'),indent=1)
