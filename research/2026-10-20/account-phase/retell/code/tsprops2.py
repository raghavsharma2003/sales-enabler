import re,sys
f,name=sys.argv[1],sys.argv[2]; maxdoc=int(sys.argv[3]) if len(sys.argv)>3 else 200
occ=int(sys.argv[4]) if len(sys.argv)>4 else 0
lines=open(f).read().split('\n')
starts=[i for i,l in enumerate(lines) if re.match(r'\s*export (interface|type) '+re.escape(name)+r'\b',l)]
if len(starts)<=occ: print('not found');sys.exit(0)
start=starts[occ]; ind=len(lines[start])-len(lines[start].lstrip())
pi=ind+2
body=[];depth=0;i=start
while i<len(lines):
    l=lines[i];body.append(l);depth+=l.count('{')-l.count('}')
    if i>start and depth<=0:break
    i+=1
doc=[];props=[]
for l in body[1:-1]:
    s=l.strip()
    if s.startswith('/**'): doc=[]
    if s.startswith('/**') or s.startswith('*'):
        t=re.sub(r'^(/\*\*|\*/|\*)\s?','',s).strip()
        if t: doc.append(t)
        continue
    m=re.match(r'^'+' '*pi+r'(\w+)(\??):\s*(.*)$',l)
    if m: props.append([m.group(1),m.group(2),m.group(3),' '.join(doc)[:maxdoc]]);doc=[]
    elif props and len(l)-len(l.lstrip())>pi and len(props[-1][2])<150: props[-1][2]+=' '+s
for p in props: print(f"{p[0]}{p[1]}: {p[2][:150]}\n    // {p[3]}")
