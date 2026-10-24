import sys,re,glob,os
pat=re.compile(sys.argv[2],re.I)
win=int(sys.argv[3]) if len(sys.argv)>3 else 2
files=sorted(glob.glob(sys.argv[1]))
skip=re.compile(r'CP_28082024|Draft_CP_13032026|CPA_Himmatnagar|Consumer_Protection_Association')
for f in files:
    if len(sys.argv)>4 and sys.argv[4]=='all': pass
    elif skip.search(f): continue
    L=open(f,errors='ignore').read().split('\n')
    hits=[i for i,l in enumerate(L) if pat.search(l)]
    if not hits: continue
    print('#####',os.path.basename(f),len(hits))
    shown=set()
    for i in hits:
        if i in shown: continue
        seg=range(max(0,i-win),min(len(L),i+win+1))
        print('  ['+str(i)+'] '+' '.join(re.sub(r'\s+',' ',L[j]).strip() for j in seg))
        shown.update(seg)
