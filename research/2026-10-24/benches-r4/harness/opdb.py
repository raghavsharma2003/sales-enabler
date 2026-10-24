#!/usr/bin/env python3
# r4 (new): reads one Operator bench run's DB and reports, per task, what followed each NOT DONE and whether the claim
# check fired. Method:
#   - Every tool result except a confirmed read is a card row in `message`, in clock order (operator/loop.ts receiptCard):
#     receipt confirmed / not_executed / unknown, or an approval card. A confirmed read leaves no row, so a retry that is a
#     successful read is invisible here (stated in the README).
#   - A NOT DONE (receipt not_executed) is "retried" when a later card in the same turn is for the same tool, "other tool"
#     when the only later cards are for other tools, and "ended" when no card follows. For a turn that ends, the last
#     assistant text is "asks the client" when it holds a question mark or an ask ("please provide/share/confirm", "could
#     you", "let me know", "would you like"), else "told the client".
#   - The claim check fired when a system notice holds operator/loop.ts CLAIM_CORRECTION.
# Usage: opdb.py <db> <out.json> [<bench.json>]. Reads only; prints a summary. Bench data is synthetic.
import collections, json, re, subprocess, sys
DB, OUT = sys.argv[1], sys.argv[2]
PSQL = ['/usr/lib/postgresql/16/bin/psql', '-h', '/dev/shm/vp-pgbench4', '-p', '55436', '-U', 'vp', '-d', DB, '-tAq']
Q = """SELECT coalesce(json_agg(json_build_object('task', substr(w.name, 7), 'msgs',
  (SELECT coalesce(json_agg(json_build_object('role', m.role, 'c', m.content) ORDER BY m.created_at, m.id), '[]'::json)
     FROM message m WHERE m.workspace_id = w.id)) ORDER BY w.created_at), '[]'::json)
FROM workspace w WHERE w.name LIKE 'bench %'"""
rows = json.loads(subprocess.run(PSQL + ['-c', Q], capture_output=True, text=True, check=True).stdout)
CLAIM = 'Correction: nothing was changed by this message.'
ASK = re.compile(r'\?|\b(please (provide|share|send|confirm|tell|let me know|specify|upload|re-?upload)|could you|can you (provide|share|confirm|tell)|let me know|would you like|do you want|shall i|should i)\b', re.I)

def items(msgs):
    out = []
    for m in msgs:
        c = m['c'] if isinstance(m['c'], dict) else {}
        k = c.get('kind')
        if m['role'] == 'user': out.append({'t': 'user'})
        elif k == 'text' and m['role'] == 'vp': out.append({'t': 'text', 'text': c.get('text', '')})
        elif k == 'card':
            cd = c.get('card') or {}
            if cd.get('type') == 'receipt': out.append({'t': 'receipt', 'tool': cd.get('tool'), 'status': cd.get('status'), 'text': (cd.get('text') or '')[:300]})
            elif cd.get('type') == 'approval': out.append({'t': 'approval', 'tool': cd.get('tool'), 'summary': (cd.get('summary') or '')[:200]})
            else: out.append({'t': 'card:' + str(cd.get('type')), 'steps': [(s.get('tool'), s.get('status')) for s in cd.get('steps', [])] if isinstance(cd.get('steps'), list) else None})
        elif m['role'] == 'system': out.append({'t': 'system:' + str(k), 'text': (c.get('text') or '')[:200]})
    return out

res = {}
for r in rows:
    it = items(r['msgs'])
    nd = []
    for i, x in enumerate(it):
        if x['t'] == 'receipt' and x['status'] == 'not_executed':
            later = [y for y in it[i + 1:] if y['t'] in ('receipt', 'approval')]
            texts = [y['text'] for y in it if y['t'] == 'text']
            follow = 'retried' if any(y['tool'] == x['tool'] for y in later) else 'other tool' if later else 'ended'
            nd.append({'tool': x['tool'], 'reason': x['text'][:240], 'follow': follow, 'laterTools': [(y['tool'], y.get('status', 'proposed')) for y in later][:8]})
    texts = [y['text'] for y in it if y['t'] == 'text']
    final = texts[-1] if texts else ''
    claims = []
    for i, x in enumerate(it):
        if x['t'].startswith('system:') and x['text'].startswith(CLAIM):
            before = [y['text'] for y in it[:i] if y['t'] == 'text']
            after = it[i + 1:]
            claims.append({'claimed': (before[-1] if before else '')[:400],
                           'repairText': ' | '.join(y['text'] for y in after if y['t'] == 'text')[:400],
                           'repairCards': [(y['tool'], y.get('status', 'proposed')) for y in after if y['t'] in ('receipt', 'approval')]})
    res[r['task']] = {'notDone': nd, 'claimCheck': claims, 'finalAsks': bool(ASK.search(final)), 'final': final[:500],
                      'cards': [(y['t'], y.get('tool'), y.get('status')) for y in it if y['t'] in ('receipt', 'approval') or y['t'].startswith('card:')],
                      'systems': [y['t'] + ': ' + y['text'][:80] for y in it if y['t'].startswith('system:')]}

# Hidden reads: the bench JSON's toolCalls minus this task's tool cards = confirmed reads, which leave no row. A NOT DONE
# on a READ tool (product/shared/tool-catalog.json risk) that "ended" while the task holds a hidden read is counted as
# "retried as a read [inferred]": the read most likely ran after the refusal (order is not stored for reads).
BENCH = sys.argv[3] if len(sys.argv) > 3 else None
RISK = {t['name']: t['risk'] for t in json.load(open('/dev/shm/wt-bench4/product/shared/tool-catalog.json'))['tools']}
tc = {t['id']: t['toolCalls'] for t in json.load(open(BENCH))['tasks']} if BENCH else {}
for t, v in res.items():
    hidden = max(0, tc.get(t, 0) - sum(1 for c in v['cards'] if c[0] in ('receipt', 'approval')))
    v['hiddenReads'] = hidden
    for x in v['notDone']:
        if x['follow'] == 'ended' and hidden and RISK.get(x['tool']) == 'read': x['follow'] = 'retried as a read [inferred]'
RETRY = ('retried', 'other tool', 'retried as a read [inferred]')
# Turn-level: a "NOT DONE turn" is a task whose turn had at least one NOT DONE. It "retried" when any of its NOT DONEs was
# followed by the same tool, a corrected other tool, or (inferred) a read; it "asked" when its last reply asks the client.
turns = {t: v for t, v in res.items() if v['notDone']}
rt = lambda v: any(x['follow'] in RETRY for x in v['notDone'])
summ = {'tasks': len(res), 'notDoneReceipts': sum(len(v['notDone']) for v in res.values()),
        'byFollow': dict(collections.Counter(x['follow'] for v in res.values() for x in v['notDone'])),
        'notDoneTurns': len(turns),
        'turnsRetried': sorted(t for t, v in turns.items() if rt(v)),
        'turnsEndedAsking': sorted(t for t, v in turns.items() if v['finalAsks']),
        'turnsRetriedThenAsked': sorted(t for t, v in turns.items() if rt(v) and v['finalAsks']),
        'turnsRetriedNoAsk': sorted(t for t, v in turns.items() if rt(v) and not v['finalAsks']),
        'turnsNoRetryAsked': sorted(t for t, v in turns.items() if not rt(v) and v['finalAsks']),
        'turnsNoRetryToldClient': sorted(t for t, v in turns.items() if not rt(v) and not v['finalAsks']),
        'lastNotDoneThenAsked': sorted(t for t, v in turns.items() if v['notDone'][-1]['follow'] == 'ended' and v['finalAsks']),
        'claimCheckFired': sorted(t for t, v in res.items() if v['claimCheck'])}
json.dump({'summary': summ, 'tasks': res}, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(json.dumps(summ, indent=1))
