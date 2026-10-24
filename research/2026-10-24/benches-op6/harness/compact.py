#!/usr/bin/env python3
# op6 (new, no model calls): a compact per-task sheet (status, every tool call with outcome and clipped args, plan-step and
# other receipt cards from the DB, check notices, brief-review findings, every reply text the member saw), for the manual
# re-read under select-rule.txt. Usage: compact.py <label> [task ...]. Bench data is synthetic.
import json, sys
T = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-op6'
lab = sys.argv[1]; only = set(sys.argv[2:]); A = int(__import__('os').environ.get('ARGS', 110))
rec = json.load(open(f'{T}/rec-{lab}.json'))['tasks']; db = json.load(open(f'{T}/opdb-{lab}.json'))['tasks']
b = {t['id']: t for t in json.load(open(f'/dev/shm/bench-out-op6/operator-{lab}.json'))['tasks']}
for t, v in rec.items():
    if only and t not in only: continue
    x = b[t]
    print(f"## {t} [{x['status']}] calls={x['toolCalls']} :: {x['why'][:110]}")
    print('   steps:', [(s['name'], s['outcome'], (s['args'] or '')[:A]) for s in v['steps']])
    print('   cards:', [c for c in db.get(t, {}).get('cards', []) if c[0] != 'card:None'])
    for n in v['notices']: print('   NOTICE', n.get('check'))
    for r in v['reviews']:
        if r['findings'] or r['mode'] != 'model': print('   REVIEW', r['mode'], r['findings'])
    for i, s in enumerate(v['texts']): print(f'   t{i}:', s.replace('\n', ' ')[:360])
