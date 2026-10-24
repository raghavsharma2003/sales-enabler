#!/usr/bin/env python3 -I
"""Derive a knob inventory from the server's own read-back of an agent plus the live OpenAPI.
Inputs : data/account-phase/elevenlabs/api-writes/agent-rich-readback.json (read-back of our synthetic agent)
         data/account-phase/elevenlabs/openapi/openapi-live.json
Outputs: data/account-phase/elevenlabs/derived/agent-config-knobs.csv  (path, value_seen, type, enum, min, max, client_override, runtime_override, description)
         data/account-phase/elevenlabs/derived/llm-list-summary.json, llm-cost-4k.csv
"""
import json, csv, collections
D = '/home/user/sales-enabler/data/account-phase/elevenlabs/'
oa = json.load(open(D + 'openapi/openapi-live.json'))
S = oa['components']['schemas']
rb = json.load(open(D + 'api-writes/agent-rich-readback.json'))

def deref(s):
    while isinstance(s, dict) and '$ref' in s:
        s = S[s['$ref'].split('/')[-1]]
    return s

def pick(s):
    """resolve anyOf to first non-null"""
    s = deref(s)
    if 'anyOf' in s:
        for x in s['anyOf']:
            x = deref(x)
            if x.get('type') != 'null':
                merged = dict(x)
                for k in ('description', 'x-convai-client-override', 'x-convai-runtime-override', 'default'):
                    if k in s and k not in merged:
                        merged[k] = s[k]
                return merged
    return s

rows = []
def walk(val, schema, path):
    sch = pick(schema) if schema else {}
    if isinstance(val, dict):
        props = (sch or {}).get('properties', {})
        addl = (sch or {}).get('additionalProperties')
        for k, v in val.items():
            sub = props.get(k) or (addl if isinstance(addl, dict) else None)
            walk(v, sub, path + '.' + k)
    elif isinstance(val, list) and val and isinstance(val[0], dict):
        items = (sch or {}).get('items')
        for i, v in enumerate(val[:1]):
            walk(v, items, path + '[]')
    else:
        d = sch or {}
        rows.append({
            'path': path.lstrip('.'),
            'value_seen': json.dumps(val)[:80],
            'type': d.get('type', ''),
            'enum': ','.join(map(str, d.get('enum', [])))[:200],
            'min': d.get('minimum', ''), 'max': d.get('maximum', ''),
            'client_override': d.get('x-convai-client-override', ''),
            'runtime_override': d.get('x-convai-runtime-override', ''),
            'description': (d.get('description') or '').replace('\n', ' ')[:300],
        })

top = deref(S['GetAgentResponseModel'])
for k in ('conversation_config', 'platform_settings'):
    walk(rb[k], top['properties'].get(k), k)
rows = [r for r in rows if not r['path'].startswith('platform_settings.widget')]
with open(D + 'derived/agent-config-knobs.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)
print('knob rows (widget excluded):', len(rows))
print('with description:', sum(1 for r in rows if r['description']))
print('runtime-overridable:', sum(1 for r in rows if r['runtime_override'] is True))

# LLM list
ll = json.load(open(D + 'api-reads/llm-list.json'))
L = ll['llms']
def prov(n):
    if n.startswith(('gpt', 'o1', 'o3', 'o4')): return 'openai'
    if n.startswith('gemini'): return 'google'
    if n.startswith('claude'): return 'anthropic'
    if n.startswith('grok'): return 'xai'
    return 'elevenlabs-hosted/other'
c = collections.Counter(prov(x['llm']) for x in L)
summ = {
    'n': len(L), 'by_provider': dict(c),
    'deprecated_or_in_warning': sum(1 for x in L if x['deprecation_info']),
    'with_fast_service_tier': sum(1 for x in L if 'fast' in (x['available_service_tiers'] or [])),
    'with_reasoning_efforts': sum(1 for x in L if x['available_reasoning_efforts']),
    'default_deprecation_config': ll['default_deprecation_config'],
    'regional_processing_surcharge_nonnull': sum(1 for x in L if x['regional_processing_surcharge']),
}
json.dump(summ, open(D + 'derived/llm-list-summary.json', 'w'), indent=1)
print(summ)

# LLM cost at 4k prompt
u = json.load(open(D + 'api-reads/llm-usage-4k.json'))['llm_prices']
with open(D + 'derived/llm-cost-4k.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['llm', 'usd_per_minute', 'usd_per_message', 'messages_per_minute_implied'])
    for x in sorted(u, key=lambda x: x['price_per_minute']):
        mpm = (x['price_per_minute'] / x['price_per_message']) if x['price_per_message'] else ''
        w.writerow([x['llm'], x['price_per_minute'], x['price_per_message'], round(mpm, 2) if mpm != '' else ''])
