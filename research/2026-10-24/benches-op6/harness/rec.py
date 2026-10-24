#!/usr/bin/env python3
# op6 copy of the op5 harness rec.py (paths only). op5 (new, no model calls): reads one scored run's recorder file (recorder.mjs) and DB, and reports per task what the
# model saw and did: every tool call with its arguments and the outcome the model was shown (DONE / NOT DONE /
# WAITING FOR APPROVAL / UNKNOWN), the reply-check repair notes it was given (number, tap, claim, confirm_first), each
# brief-review request and what it returned (the review's mode), and the final reply (from the DB).
# Requests are assigned to tasks by time: each task's workspace is created just before its first request.
# Usage: rec.py <label> <db> <out.json>. Bench data is synthetic. Output stays in the scratchpad (it holds tool results).
import bisect, json, re, subprocess, sys
from datetime import datetime
T = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/bench-tools-op6'
LABEL, DB, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
PSQL = ['/usr/lib/postgresql/16/bin/psql', '-h', '/dev/shm/vp-pgbench-op6', '-p', '55441', '-U', 'vp', '-d', DB, '-tAq']
Q = """SELECT coalesce(json_agg(json_build_object('task', substr(w.name, 7), 'at', w.created_at,
  'msgs', (SELECT coalesce(json_agg(json_build_object('role', m.role, 'c', m.content) ORDER BY m.created_at, m.id), '[]'::json) FROM message m WHERE m.workspace_id = w.id))
  ORDER BY w.created_at), '[]'::json) FROM workspace w WHERE w.name LIKE 'bench %'"""
ws = json.loads(subprocess.run(PSQL + ['-c', Q], capture_output=True, text=True, check=True).stdout)
ts = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()
starts = [ts(w['at']) for w in ws]
rows = [json.loads(l) for l in open(f'{T}/record-{LABEL}.jsonl')]
by = {w['task']: [] for w in ws}
for r in rows:
    i = bisect.bisect_right(starts, ts(r['ts'])) - 1
    if i >= 0: by[ws[i]['task']].append(r)

REPAIR = [('number', 'Check failed: your reply states'), ('tap', 'Check failed: your reply asks the client to tap'),
          ('claim', 'Check failed: your reply says something was changed'), ('confirm_first', 'The client already asked for this.')]
def outcome(s):
    m = re.search(r'"outcome":\s*"([A-Z ]+)"', s or '')
    return m.group(1) if m else None

res = {}
for w in ws:
    t = w['task']; reqs = by[t]
    ops = [r for r in reqs if r['tools']]
    other = [r for r in reqs if not r['tools']]
    reviews = []
    for r in other:
        head = next((m.get('head', '') for m in r['msgs'] if m['role'] == 'system'), '')
        kind = 'brief_review' if head.startswith('You review the instruction text') else 'draft' if head.startswith('You draft the configuration') else head[:40]
        if kind != 'brief_review': continue
        if r.get('error'): mode = 'unavailable: ' + ('timeout' if 'abort' in r['error'].lower() else 'error') + f" ({r['error'][:60]})"
        else:
            try: f = json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '', (r.get('reply') or '').strip()))['findings']; mode = 'model'
            except Exception: f = None; mode = 'bad_output?'
        reviews.append({'mode': mode, 'status': r.get('status'), 'findings': f, 'fields': (next((m.get('content', '') for m in r['msgs'] if m['role'] == 'user'), ''))[:1500]})
    # The last operator request holds the whole turn except the final reply.
    last = max(ops, key=lambda r: len(r['msgs'])) if ops else None
    calls, results = [], []
    repairs = []
    if last:
        msgs = last['msgs']
        for i, m in enumerate(msgs):
            if m.get('calls'):
                for c in m['calls']: calls.append({'name': c['name'], 'args': c['args']})
            if m['role'] == 'tool': results.append(m['content'])
            if m['role'] == 'system' and 'content' in m:
                for k, p in REPAIR:
                    if m['content'].startswith(p): repairs.append({'kind': k, 'after': next((x.get('content') for x in reversed(msgs[:i]) if x['role'] == 'assistant' and x.get('content')), None)})
    steps = [{**c, 'outcome': outcome(results[i]) if i < len(results) else None, 'result': results[i] if i < len(results) else None} for i, c in enumerate(calls)]
    texts = [m['c'].get('text', '') for m in w['msgs'] if m['role'] == 'vp' and isinstance(m['c'], dict) and m['c'].get('kind') == 'text']
    notices = [m['c'] for m in w['msgs'] if m['role'] == 'system' and isinstance(m['c'], dict) and str(m['c'].get('text', '')).startswith('Correction:')]
    cards = [m['c'].get('card', {}) for m in w['msgs'] if isinstance(m['c'], dict) and m['c'].get('kind') == 'card']
    res[t] = {'requests': len(reqs), 'operatorRequests': len(ops), 'steps': steps, 'repairs': repairs, 'reviews': reviews,
              'notices': notices, 'texts': texts, 'final': texts[-1] if texts else '',
              'cards': [(c.get('type'), c.get('tool'), c.get('status')) for c in cards]}
summ = {'tasks': len(res),
        'repairsByKind': {k: sorted(t for t, v in res.items() if any(r['kind'] == k for r in v['repairs'])) for k, _ in REPAIR},
        'reviews': {'requests': sum(len(v['reviews']) for v in res.values()),
                    'byMode': {m: sum(1 for v in res.values() for r in v['reviews'] if r['mode'].split(' (')[0] == m) for m in sorted({r['mode'].split(' (')[0] for v in res.values() for r in v['reviews']})},
                    'withFindings': {t: [f for r in v['reviews'] for f in (r['findings'] or [])] for t, v in res.items() if any(r['findings'] for r in v['reviews'])}},
        'zeroToolReplies': sorted(t for t, v in res.items() if v['operatorRequests'] and not v['steps'])}
json.dump({'summary': summ, 'tasks': res}, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(json.dumps(summ, indent=1, ensure_ascii=False)[:4000])
