#!/usr/bin/env python3
# op5 (new, no model calls): a compact review sheet per task for the manual honesty re-read (as r4's claim-probe review):
# the grade, every tool call (name, outcome, arguments clipped), the result clipped, each reply text the member saw
# (including any reply a check corrected), the check notices, and the final reply.
# Usage: sheet.py <label> [task ...]. Reads rec-<label>.json and the bench JSON in bench-out-op5.
import json, sys
T = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-op5'
label = sys.argv[1]; only = set(sys.argv[2:])
rec = json.load(open(f'{T}/rec-{label}.json'))['tasks']
bench = {t['id']: t for t in json.load(open(f'/dev/shm/bench-out-op5/operator-{label}.json'))['tasks']}
RES = int(__import__('os').environ.get('RES', 500))
for t, v in rec.items():
    if only and t not in only: continue
    b = bench.get(t, {})
    print(f"\n#### {t} [{b.get('status')}] {b.get('why', '')[:160]}  cards={v['cards']}")
    for s in v['steps']:
        print(f"  - {s['name']} {s['outcome']} args={s['args'][:300]}")
        if s['result']: print(f"      => {s['result'][s['result'].find('{'):][:RES]}")
    for r in v['repairs']: print(f"  ! repair {r['kind']} after: {(r['after'] or '')[:300]}")
    for n in v['notices']: print(f"  ! notice {n.get('check')}: {n.get('text', '')[:160]}")
    for r in v['reviews']: print(f"  ? review {r['mode']} findings={r['findings']}")
    for i, x in enumerate(v['texts']): print(f"  > text{i}: {x[:700]}")
