"""Build manifest.csv for data/account-phase/retell (run with python3 -I). Excludes extracted package trees (x/) which are derivable from the tarballs."""
import os,hashlib,csv,datetime
D='/home/user/sales-enabler/data/account-phase/retell'
OUT='/home/user/sales-enabler/research/2026-10-20/account-phase/retell/manifest.csv'
src={'api-reads':'https://api.retellai.com read-only call with our API key (vp-teardown)','api-writes':'https://api.retellai.com create/update/delete of synthetic resources with our API key','auth-sweep':'https://api.retellai.com GET sweep with invalid probe ids, our API key','openapi':'https://docs.retellai.com public OpenAPI/llms.txt','sdk':'npm pack / pip download of the published SDK (not installed)','rea':'rea-agents 6.7.0 analyze-javascript-application on retell-client-js-sdk 3.0.2 package','derived':'derived locally from the saved SDK source / OpenAPI','imports':'synthetic CSV authored by us (upload blocked: Invalid JWT)','webhooks':'none'}
rows=[]
for root,dirs,files in os.walk(D):
    dirs[:]=[d for d in dirs if d!='x']
    for f in sorted(files):
        p=os.path.join(root,f); rel=os.path.relpath(p,'/home/user/sales-enabler')
        top=os.path.relpath(p,D).split(os.sep)[0]
        h=hashlib.sha256(open(p,'rb').read()).hexdigest()
        t=datetime.datetime.fromtimestamp(os.path.getmtime(p),datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        rows.append([rel,os.path.getsize(p),h,src.get(top,top),t])
rows.sort()
with open(OUT,'w',newline='') as fh:
    w=csv.writer(fh); w.writerow(['path','bytes','sha256','source','fetched_at']); w.writerows(rows)
print(len(rows),'rows')
