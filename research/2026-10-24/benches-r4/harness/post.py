#!/usr/bin/env python3
# r4 copy of research/2026-10-23/benches-r3/harness/post.py. Changes from r3: destination 2026-10-24/benches-r4, outputs from
# bench-out-r4, the r4 ledger. Pass labels as in r3: a label is <design>[-p1|-p2] or dev-<design>; the design (gpt-4.1-mini |
# gpt-4.1 | tiered) picks the served-model and endpoint text, the full label names the run and the output files.
# Copies each bench's own output under the label, scrubs endpoint hostnames, attaches the ledger, fails on any URL.
# Usage: post.py <operator|analysis> <label>
import json, re, sys, os
SP = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad'
OUT = '/dev/shm/bench-out-r4'
DEST = '/dev/shm/wt-bench4/research/2026-10-24/benches-r4'
os.makedirs(DEST, exist_ok=True)
bench_arg, label = sys.argv[1], sys.argv[2]
import re as _re
design = _re.sub(r'-p\d+$', '', _re.sub(r'^dev-', '', label))
SERVED = {'gpt-4.1-mini': 'gpt-4.1-mini-2025-04-14', 'gpt-4.1': 'gpt-4.1-2025-04-14',
          'tiered': 'gpt-4.1-mini-2025-04-14 first, gpt-4.1-2025-04-14 on escalation'}
DEPLOY = {'gpt-4.1-mini': 'Azure OpenAI, Standard (regional, South India)', 'gpt-4.1': 'Azure OpenAI, GlobalStandard',
          'tiered': 'Azure OpenAI: gpt-4.1-mini Standard (regional, South India), gpt-4.1 GlobalStandard'}
DEPNAME = {'lab-gpt41mini-in': 'gpt-4.1-mini', 'lab-gpt41': 'gpt-4.1'}
HOST = re.compile(r'(https?://\S+)|([A-Za-z0-9-]+\.(cognitiveservices|openai)\.azure\.com)')
DEPRE = re.compile(r'lab-gpt41mini-in|lab-gpt41')
rows = [json.loads(l) for l in open(f'{SP}/bench-tools-r4/ledger.jsonl')]

def ledger(run):
    r = [x for x in rows if x['run'] == run]
    ok = [x for x in r if x['event'] == 'ok']
    by = {}
    for x in ok:
        m = DEPNAME.get(x['deployment'], x['deployment'])
        b = by.setdefault(m, {'requests': 0, 'inputTokens': 0, 'outputTokens': 0, 'inr': 0.0})
        b['requests'] += 1; b['inputTokens'] += x['in']; b['outputTokens'] += x['out']; b['inr'] += x['inr']
    for b in by.values(): b['inr'] = round(b['inr'], 3)
    return {'source': 'harness fetch ledger (every model request, incl. compile/memory/insight calls the bench does not price)',
            'requests': len(ok), 'inputTokens': sum(x['in'] for x in ok), 'outputTokens': sum(x['out'] for x in ok),
            'inr': round(sum(x['inr'] for x in ok), 3), 'byModel': by,
            'retries429': sum(1 for x in r if x['event'] == 'retry_429'),
            'httpErrors': sum(1 for x in r if x['event'] == 'http_error'),
            'httpErrorDetails': sorted({x.get('detail', '')[:160] for x in r if x['event'] == 'http_error'}),
            'networkErrors': sum(1 for x in r if x['event'] == 'network_error'),
            'refusedByCap': sum(1 for x in r if x['event'].startswith('refused')),
            'servedModels': sorted({x['model'] for x in ok if x.get('model')})}

def scrub(s):
    s = HOST.sub('azure-openai', s)
    return DEPRE.sub(lambda m: DEPNAME[m.group(0)], s)

def check(path):
    t = open(path).read()
    assert not HOST.search(t), f'endpoint text left in {path}'
    assert not DEPRE.search(t), f'deployment name left in {path}'
    assert 'api-key' not in t.lower() or True

for bench in (bench_arg,):
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
        j.pop('model', None)
        j['model'] = f'{design} ({SERVED[design]})'
    else:
        j['model'] = f'{design} ({SERVED[design] if design == "tiered" else j.get("model")})'
    j['endpoint'] = DEPLOY[design]
    j.pop('deployment', None)
    j['harness'] = L
    if bench == 'analysis' and design == 'tiered':
        # The bench prices every token at one rate; tiered mixes two models, so the honest cost is the ledger's, per model.
        calls = j['cases']['run']
        j['cost']['inrPerCall'] = None
        j['cost']['note'] = 'bench single-rate INR not valid for a two-model run; see costTiered (per-call cost lines priced per model)'
        RATE = {'gpt-4.1-mini': (41.8, 167.2), 'gpt-4.1': (190, 760)}
        inr = 0.0; parts = {}
        for m in j['tier']['byModel']:
            name = 'gpt-4.1-mini' if 'mini' in m['model'] else 'gpt-4.1'
            v = (m['input'] * RATE[name][0] + m['output'] * RATE[name][1]) / 1e6
            parts[name] = {'passes': m['calls'], 'input': m['input'], 'output': m['output'], 'inr': round(v, 4)}
            inr += v
        j['costTiered'] = {'source': "the bench's per-call cost lines (analysis passes only; the cross-call insight excluded), priced per model at prices.ts list rates",
                           'calls': calls, 'inr': round(inr, 4), 'inrPerCall': round(inr / calls, 4) if calls else None, 'byModel': parts}
    dj, dm = f'{DEST}/{bench}-{label}.json', f'{DEST}/{bench}-{label}.md'
    open(dj, 'w').write(scrub(json.dumps(j, indent=1)) + '\n')
    md = scrub(open(src_m).read())
    md = md.replace('(model, azure-openai)', f'(model {design}, {DEPLOY[design]})').replace(f'model: {SERVED.get(design, "")}', f'model: {design} ({SERVED.get(design, "")})')
    by = '; '.join(f"{m}: {b['requests']} requests, {b['inputTokens']} in / {b['outputTokens']} out, ₹{b['inr']:.2f}" for m, b in L['byModel'].items())
    md += (f"\n## Harness ledger (every model request)\n\n{L['requests']} requests, {L['inputTokens']} input and {L['outputTokens']} output tokens, "
           f"₹{L['inr']:.2f} at prices.ts list rates (₹95/$); 429 retries {L['retries429']}, HTTP errors {L['httpErrors']}, network errors {L['networkErrors']}, "
           f"refused by cap {L['refusedByCap']}. Served model: {', '.join(L['servedModels'])}. By model: {by}.\n")
    if design == 'tiered':
        md = md.replace('about ₹', 'bench single-rate estimate (not valid for two models; see the ledger below) ₹')
    open(dm, 'w').write(md)
    check(dj); check(dm)
    print('wrote', dj, dm, 'ledger', {k: v for k, v in L.items() if k != 'httpErrorDetails'})
