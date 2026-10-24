import re,json,sys,glob,os
root='/home/user/sales-enabler/data/account-phase/retell/sdk/npm-retell-sdk/x/package/src/resources'
ops=[]
for f in sorted(glob.glob(root+'/*.ts')):
    t=open(f).read()
    for m in re.finditer(r'(\w+)\(([^)]*)\)[^{;]*\{\s*return this\._client\.(get|post|put|patch|delete)\(([^,)]+)',t):
        pass
    # generic: find "_client.METHOD(" followed by path expr
    for m in re.finditer(r'(\w+)\([^)]*\):[^{]*\{\s*(?:const[^;]*;\s*)?return this\._client\.(get|post|put|patch|delete)\(\s*(`[^`]*`|path`[^`]*`|\'[^\']*\'|"[^"]*")',t,re.S):
        ops.append((os.path.basename(f),m.group(1),m.group(2).upper(),m.group(3)))
print(len(ops))
json.dump(ops,open('/home/user/sales-enabler/data/account-phase/retell/derived/sdk-ts-ops-raw.json','w'),indent=0)
for o in ops[:8]: print(o)
