"""Print an OpenAPI component schema (one level of refs expanded). Usage: python3 -I schema.py <openapi.json> <SchemaName> [depth]"""
import json, sys
d = json.load(open(sys.argv[1])); S = d['components']['schemas']
maxd = int(sys.argv[3]) if len(sys.argv) > 3 else 1
def tname(v):
    if '$ref' in v: return v['$ref'].split('/')[-1]
    if 'anyOf' in v: return '|'.join(tname(x) for x in v['anyOf'])
    if 'oneOf' in v: return 'oneOf(' + '|'.join(tname(x) for x in v['oneOf']) + ')'
    if v.get('type') == 'array': return 'array[' + tname(v.get('items', {})) + ']'
    return v.get('type', '?')
def refs(v):
    out = []
    if '$ref' in v: out.append(v['$ref'].split('/')[-1])
    for k in ('anyOf', 'oneOf', 'allOf'):
        for x in v.get(k, []): out += refs(x)
    if v.get('type') == 'array': out += refs(v.get('items', {}))
    return out
seen = set()
def show(name, depth=0):
    if name in seen or name not in S: return
    seen.add(name); s = S[name]
    print('  ' * depth + '## ' + name + ' :: ' + (s.get('description') or '')[:220].replace('\n', ' '))
    if 'enum' in s: print('  ' * depth + '   enum ' + str(s['enum']))
    for k, v in s.get('properties', {}).items():
        en = v.get('enum') or ''
        dflt = (' default=' + json.dumps(v['default'])[:60]) if 'default' in v else ''
        print('  ' * depth + '  - %s : %s %s%s | %s' % (k, tname(v), en, dflt, (v.get('description') or '')[:200].replace('\n', ' ')))
    if depth < maxd:
        for k, v in s.get('properties', {}).items():
            for r in refs(v): show(r, depth + 1)
for n in sys.argv[2].split(','): show(n)
