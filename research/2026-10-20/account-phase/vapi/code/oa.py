import json,sys
D=json.load(open('/home/user/sales-enabler/data/account-phase/vapi/openapi/api-json.json'))
S=D['components']['schemas']
def ref(r): return r.split('/')[-1]
def desc(s,n=0):
    d=(s.get('description') or '').replace('\n',' ')
    return d if not n else d[:n]
def typ(s):
    if '$ref' in s: return '->'+ref(s['$ref'])
    if 'oneOf' in s or 'anyOf' in s:
        k='oneOf' if 'oneOf' in s else 'anyOf'
        return '|'.join(typ(x) for x in s[k])
    if 'allOf' in s: return '&'.join(typ(x) for x in s['allOf'])
    t=s.get('type')
    if t=='array': return 'array<'+typ(s.get('items',{}))+'>'
    if 'enum' in s: return 'enum['+','.join(map(str,s['enum'][:40]))+(',...%d'%len(s['enum']) if len(s['enum'])>40 else '')+']'
    return str(t)
def props(name):
    s=S[name]
    out=[]
    for p,v in s.get('properties',{}).items():
        c={k:v[k] for k in ('default','minimum','maximum','minLength','maxLength','example','nullable','deprecated','pattern') if k in v}
        out.append((p,typ(v),c,desc(v)))
    return s.get('required',[]),out
if __name__=='__main__':
    for n in sys.argv[1:]:
        r,o=props(n)
        print('###',n,'required=',r)
        for p,t,c,d in o: print('  -',p,':',t,c if c else '',':: ',d[:260])
