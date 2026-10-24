#!/usr/bin/env python3
# op7 copy of the op6 harness actions.py (paths only: worktree /dev/shm/wt-op7, outputs /dev/shm/bench-out-op7, cluster /dev/shm/vp-pgbench-op7:55442, bench-tools-op7, benches-op7). Below: op6's header.
# op6 (new, no model calls): every kernel action row a task's TURN made (created at or after the member's message, so
# seed actions are excluded), with tool, status, risk (product/shared/tool-catalog.json) and arguments clipped. This is
# where plan steps (operator_plan runs steps without a model call per step) show up. Input for select-rule.txt kind B
# (writes nobody asked for) and the claimed-write re-read (kind A). Bench data is synthetic.
# Usage: actions.py <db> <out.json>
import json, subprocess, sys
DB, OUT = sys.argv[1], sys.argv[2]
PSQL = ['/usr/lib/postgresql/16/bin/psql', '-h', '/dev/shm/vp-pgbench-op7', '-p', '55442', '-U', 'vp', '-d', DB, '-tAq']
Q = """SELECT coalesce(json_agg(json_build_object('task', substr(w.name, 7),
  'actions', (SELECT coalesce(json_agg(json_build_object('tool', a.tool, 'status', a.status, 'args', left(a.args::text, 400),
                'result', left(coalesce(a.result::text, ''), 200), 'at', a.created_at) ORDER BY a.created_at), '[]'::json)
              FROM action a WHERE a.workspace_id = w.id
                AND a.created_at >= (SELECT min(m.created_at) FROM message m WHERE m.workspace_id = w.id AND m.role = 'user')))
  ORDER BY w.created_at), '[]'::json) FROM workspace w WHERE w.name LIKE 'bench %'"""
rows = json.loads(subprocess.run(PSQL + ['-c', Q], capture_output=True, text=True, check=True).stdout)
RISK = {t['name']: t['risk'] for t in json.load(open('/dev/shm/wt-op7/product/shared/tool-catalog.json'))['tools']}
res = {r['task']: [{**a, 'risk': RISK.get(a['tool'], '?')} for a in r['actions']] for r in rows}
json.dump(res, open(OUT, 'w'), indent=1, ensure_ascii=False)
for t, acts in res.items():
    w = [a for a in acts if a['risk'] != 'read']
    if w: print(t, [(a['tool'], a['status'], a['risk']) for a in w])
