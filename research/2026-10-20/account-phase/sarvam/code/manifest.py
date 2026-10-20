import os,hashlib,csv,datetime,re,glob
ROOT='/home/user/sales-enabler/'
R=ROOT+'data/account-phase/sarvam/'
src={
 'models-':'GET https://api.sarvam.ai/v2/models (our key, read-only)',
 'model-':'GET https://api.sarvam.ai/v2/models/{id} (our key, read-only)',
 'voices-list':'GET https://api.sarvam.ai/voices (our key, read-only)',
 'pron-list':'GET https://api.sarvam.ai/text-to-speech/pronunciation-dictionary (our key, read-only)',
 'probe-':'POST https://api.sarvam.ai/<route> with empty JSON body (400 validation error, no spend)',
 'disc':'GET https://apps.sarvam.ai/api/app-authoring/... (discovery probe, our key, refused)',
 'va-':'GET https://apps.sarvam.ai/api/{analytics|app-authoring|app-runtime}/... all-zero UUID scope (our key, refused)',
 'mcp-':'GET https://mcp.sarvam.ai/... unauthenticated OAuth discovery',
 'empty.json':'local empty JSON body used for validation probes',
}
rows=[]
def add(p,source,t=None):
    st=os.stat(p); h=hashlib.sha256(open(p,'rb').read()).hexdigest()
    ts=t or datetime.datetime.utcfromtimestamp(st.st_mtime).strftime('%Y-%m-%dT%H:%M:%SZ')
    rows.append((os.path.relpath(p,ROOT),st.st_size,h,source,ts))
for p in sorted(glob.glob(R+'api-reads/*')):
    b=os.path.basename(p); s=next((v for k,v in src.items() if b.startswith(k)),'authorized probe')
    add(p,s)
for p in sorted(glob.glob(R+'openapi/*')): add(p,'GET https://docs.sarvam.ai/openapi/'+os.path.basename(p))
for p in sorted(glob.glob(R+'docs/*')):
    b=os.path.basename(p)
    if b=='fetchlog.tsv': add(p,'local fetch log'); continue
    if b=='llms.txt': add(p,'GET https://docs.sarvam.ai/llms.txt'); continue
    if b=='changelog.md': add(p,'GET https://docs.sarvam.ai/changelog.md'); continue
    if b=='voice-agents_llms.txt': add(p,'GET https://docs.sarvam.ai/voice-agents/llms.txt'); continue
    add(p,'GET https://docs.sarvam.ai/'+b[:-3].replace('_','/')+'.md')
for p in sorted(glob.glob(R+'sdk/*/*.tgz')+glob.glob(R+'sdk/*/*.whl')):
    reg='registry.npmjs.org' if p.endswith('.tgz') else 'pypi.org (pip download --no-deps)'
    add(p,'package archive from '+reg)
for d in ('pypi-conv-ai','npm-conv-ai'):
    for dp,_,fs in os.walk(R+'sdk/'+d+'/x'):
        for f in sorted(fs):
            p=os.path.join(dp,f)
            if '/android/' in p: continue
            add(p,'extracted from the '+d+' archive (unzip/tar only, not installed or executed)')
for p in sorted(glob.glob(R+'rea/*')): add(p,'npx rea-agents analyze-javascript-application on sdk/npm-conv-ai/x/package (static, inert)' if p.endswith('.json') or p.endswith('.err') else 'local status file')
for p in sorted(glob.glob(R+'derived/*')): add(p,'derived locally from the files above (scripts in session scratchpad)')
for p in sorted(glob.glob(R+'cleanup/*')): add(p,'local note')
# note on big extracted trees
with open(ROOT+'research/2026-10-20/account-phase/sarvam/manifest.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['path','bytes','sha256','source','fetched_at']); w.writerows(rows)
print(len(rows))
