#!/usr/bin/env python3
# Copy the benches' own outputs into research/2026-10-23/benches/ under model names, scrub endpoint hostnames,
# and attach the harness ledger's spend per run. Usage: post.py <label>  (label = gpt-4.1-mini | gpt-4.1)
import json, re, sys, os
SP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad'
OUT = '/dev/shm/bench-out'
DEST = '/dev/shm/wt-bench/research/2026-10-23/benches'
os.makedirs(DEST, exist_ok=True)
label = sys.argv[1]
SERVED = {'gpt-4.1-mini': 'gpt-4.1-mini-2025-04-14', 'gpt-4.1': 'gpt-4.1-2025-04-14'}
DEPLOY = {'gpt-4.1-mini': 'Azure OpenAI, Standard (regional, South India)', 'gpt-4.1': 'Azure OpenAI, GlobalStandard'}
HOST = re.compile(r'(https?://\S+)|([A-Za-z0-9-]+\.(cognitiveservices|openai)\.azure\.com)')
rows = [json.loads(l) for l in open(f'{SP}/bench-tools/ledger.jsonl')]

def ledger(run):
    r = [x for x in rows if x['run'] == run]
    ok = [x for x in r if x['event'] == 'ok']
    return {'source': 'harness fetch ledger (every model request, incl. compile/memory calls the bench does not price)',
            'requests': len(ok), 'inputTokens': sum(x['in'] for x in ok), 'outputTokens': sum(x['out'] for x in ok),
            'inr': round(sum(x['inr'] for x in ok), 3),
            'retries429': sum(1 for x in r if x['event'] == 'retry_429'),
            'httpErrors': sum(1 for x in r if x['event'] == 'http_error'),
            'networkErrors': sum(1 for x in r if x['event'] == 'network_error'),
            'refusedByCap': sum(1 for x in r if x['event'].startswith('refused')),
            'servedModels': sorted({x['model'] for x in ok if x.get('model')})}

def scrub(s):
    return HOST.sub('azure-openai', s)

def check(path):
    t = open(path).read()
    assert not HOST.search(t), f'endpoint text left in {path}'

for bench in ('operator', 'analysis'):
    run = f'{bench}-{label}'
    if bench == 'operator':
        src_j, src_m = f'{OUT}/operator-{label}.json', f'{OUT}/operator-{label}.md'
    else:
        src_j, src_m = f'{OUT}/analysis-{label}/analysis-bench.json', f'{OUT}/analysis-{label}/analysis-bench.md'
    if not os.path.exists(src_j):
        print('missing', src_j); continue
    j = json.load(open(src_j))
    L = ledger(run)
    if bench == 'operator':
        j['deployment'] = j.pop('model', None) and None
        j['model'] = f'{label} ({SERVED[label]})'
        j['endpoint'] = DEPLOY[label]
    else:
        j['model'] = f'{label} ({j.get("model")})'
        j['endpoint'] = DEPLOY[label]
    j.pop('deployment', None)
    j['harness'] = L
    dj, dm = f'{DEST}/{bench}-{label}.json', f'{DEST}/{bench}-{label}.md'
    open(dj, 'w').write(scrub(json.dumps(j, indent=1)) + '\n')
    md = scrub(open(src_m).read())
    md = md.replace('(model, azure-openai)', f'(model {label}, {DEPLOY[label]})').replace(f'model: {SERVED[label]}', f'model: {label} ({SERVED[label]})')
    md += (f"\n## Harness ledger (every model request)\n\n{L['requests']} requests, {L['inputTokens']} input and {L['outputTokens']} output tokens, "
           f"₹{L['inr']:.2f} at prices.ts list rates (₹95/$); 429 retries {L['retries429']}, HTTP errors {L['httpErrors']}, network errors {L['networkErrors']}, "
           f"refused by cap {L['refusedByCap']}. Served model: {', '.join(L['servedModels'])}.\n")
    open(dm, 'w').write(md)
    check(dj); check(dm)
    print('wrote', dj, dm, 'ledger', L)
